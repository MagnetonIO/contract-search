#!/usr/bin/env python3
"""Bounded contract search. Run python3 runner.py --help for local usage."""
import argparse
import csv
from concurrent.futures import ThreadPoolExecutor
import threading
import os
import subprocess
from collectors import SourceError, Budget, adapt, variants
from datetime import datetime, timedelta, timezone
from difflib import SequenceMatcher
import email.utils
import html
import json
from pathlib import Path
import re
import sqlite3
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from urllib.request import Request, HTTPRedirectHandler, build_opener
import xml.etree.ElementTree as ET
from zoneinfo import ZoneInfo
from credentials import load_token as token_from_local
from credentials import load_secret

UTC = timezone.utc
API = 'https://api.apify.com/v2'
TERMINAL = {'SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT'}
SKILLS = r'\b(?:software|architect|cloud|artificial intelligence|aws|gcp|kubernetes|golang|typescript|react|next\.?js|python|java|rust|data engineer|devops|sre|platform engineer|machine learning|ai engineer|ai agent)\b'
AGENCIES = r'\b(?:recruitment|recruiting|staffing|talent|tek.?systems|insight global|robert half|randstad|kforce|apex systems|motion recruitment|dice job bot)\b'
FIELDS = ['title', 'company_agency', 'source', 'source_job_id', 'source_posted_at',
          'source_date_text', 'first_seen', 'pay', 'hourly_min_usd', 'contract_status',
          'c2c_status', 'duration', 'remote_location', 'work_arrangement',
          'work_abroad_restrictions', 'geography', 'application_url', 'source_url',
          'public_recruiter_contact', 'fit_tier', 'fit_reason', 'pipeline',
          'direct_client_classification', 'direct_client_evidence', 'official_employer_url']


class CredentialMissing(SourceError):
    pass


class SafeRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        sensitive = req.has_header('Authorization') or any(k.lower() == 'api_key' for k, _ in parse_qsl(urlsplit(req.full_url).query))
        if sensitive and (urlsplit(newurl).netloc != urlsplit(req.full_url).netloc or urlsplit(newurl).scheme != 'https'):
            raise SourceError('Refused credential-bearing redirect to another host or an insecure connection')
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def plain(value):
    if isinstance(value, (dict, list)):
        value = json.dumps(value, ensure_ascii=False)
    return re.sub(r'\s+', ' ', html.unescape(re.sub('<[^>]+>', ' ', str(value or '')))).strip()


def canonical(url):
    try:
        p = urlsplit(str(url or ''))
        if p.scheme not in ('http', 'https') or not p.hostname or p.username:
            return ''
        keep = [(k, v) for k, v in parse_qsl(p.query) if not k.lower().startswith('utm_') and k.lower() not in
                {'trackingid', 'refid', 'trk', 'token', 'access_token', 'api_key', 'apikey', 'authorization', 'signature', 'source', 'ref', 'from', 'referrer', 'campaign'}]
        path = p.path.rstrip('/')
        m = re.search(r'/jobs/view/(?:[^/]*-)?(\d+)', path)
        if 'linkedin.com' in p.hostname and m:
            path = '/jobs/view/' + m[1]
        return urlunsplit(('https', p.netloc.lower(), path, urlencode(sorted(keep)), ''))
    except ValueError:
        return ''


def fetch(url, *, token='', payload=None, method=None, raw=False, timeout=30, attempts=None):
    headers = {'User-Agent': 'ContractSearch/1.0 (private personal research)',
               'Accept': 'application/json, application/rss+xml, text/html'}
    if token:
        if not url.startswith(API + '/'):
            raise SourceError('Refused credential use outside Apify API')
        headers['Authorization'] = 'Bearer ' + token
    data = None if payload is None else json.dumps(payload).encode()
    if data is not None:
        headers['Content-Type'] = 'application/json'
    req = Request(url, data=data, headers=headers, method=method)
    # POST starts are never retried: a lost response must not start a second paid run.
    tries = attempts if attempts is not None else (3 if data is None else 1)
    for attempt in range(tries):
        try:
            with build_opener(SafeRedirect()).open(req, timeout=timeout) as response:
                body = response.read(25_000_001)
                if len(body) > 25_000_000:
                    raise SourceError('Response exceeded 25 MB bound')
                return body if raw else json.loads(body)
        except HTTPError as exc:
            if data is None and exc.code in (429, 500, 502, 503, 504) and attempt < tries-1:
                time.sleep(2 ** attempt)
                continue
            raise SourceError(f'HTTP {exc.code}') from None
        except (URLError, TimeoutError, json.JSONDecodeError):
            if data is None and attempt < tries-1:
                time.sleep(2 ** attempt)
                continue
            raise SourceError('Network timeout, connection failure, or invalid JSON') from None


def validate_input(schema, value):
    if not isinstance(schema, dict) or not isinstance(schema.get('properties'), dict):
        raise SourceError('Actor schema is not inline; adapter requires review')
    for key in schema.get('required', []):
        if key not in value:
            raise SourceError('Actor input missing required field: ' + key)
    for key, v in value.items():
        prop = schema['properties'].get(key)
        if prop is None:
            raise SourceError('Actor schema changed; unsupported input field: ' + key)
        typ = prop.get('type')
        valid = {'string': isinstance(v, str), 'array': isinstance(v, list),
                 'boolean': isinstance(v, bool), 'object': isinstance(v, dict),
                 'integer': type(v) is int, 'number': type(v) in (int, float)}
        if typ in valid and not valid[typ]:
            raise SourceError('Actor input type mismatch: ' + key)
        if 'enum' in prop and v not in prop['enum']:
            raise SourceError('Actor enum changed: ' + key)
        if type(v) in (int, float) and (v < prop.get('minimum', v) or v > prop.get('maximum', v)):
            raise SourceError('Actor input outside bounds: ' + key)
        if isinstance(v, list) and 'enum' in prop.get('items', {}):
            if any(x not in prop['items']['enum'] for x in v):
                raise SourceError('Actor item enum changed: ' + key)


def collect_actor(spec, token, smoke=False, journal=None, budget=None):
    if not token:
        raise SourceError('APIFY_TOKEN is missing')
    actor = spec['actor']
    meta = fetch(f'{API}/acts/{actor}', token=token)['data']
    pricing = [p for p in meta.get('pricingInfos', [])
               if p.get('startedAt', '') <= datetime.now(UTC).isoformat()]
    pricing = max(pricing, key=lambda p: p.get('startedAt', ''), default={})
    if pricing.get('pricingModel') not in ('PAY_PER_EVENT', 'PRICE_PER_DATASET_ITEM'):
        raise SourceError('Unsupported pricing; refusing a potentially uncapped rental/run')
    build = fetch(f'{API}/acts/{actor}/builds/default', token=token)['data']
    body = json.loads(json.dumps(spec['input']))
    cap = 0.15 if smoke else spec['cap_usd']
    max_items = spec['max_items']
    validate_input(build.get('actorDefinition', {}).get('input'), body)
    if pricing.get('minimalMaxTotalChargeUsd') and pricing['minimalMaxTotalChargeUsd'] > cap:
        raise SourceError('Actor minimum charge cap exceeds configured budget')
    opts = urlencode({'maxTotalChargeUsd': cap, 'maxItems': max_items,
                      'timeout': 480 if not smoke else 180, 'memory': 512,
                      'build': build['buildNumber']})
    if pricing.get('isPPEPlatformUsagePaidByUser') or meta.get('isPPEPlatformUsagePaidByUser'):
        raise SourceError('Separate platform charges are unsupported by the daily cap')
    reservation = budget.reserve(cap, spec['name']) if budget else None
    run = fetch(f'{API}/acts/{actor}/runs?{opts}', token=token, payload=body)['data']
    record = {'source': spec['name'], 'run_id': run['id'], 'cap_usd': cap,
              'build': build['buildNumber'], 'status': run['status'], 'reservation_id': reservation}
    deadline = time.monotonic() + (540 if not smoke else 240)
    try:
        if journal:
            journal(record)
        while run['status'] not in TERMINAL:
            if time.monotonic() >= deadline:
                raise SourceError('Actor polling deadline exceeded')
            time.sleep(5)
            run = fetch(f"{API}/actor-runs/{run['id']}", token=token)['data']
    finally:
        if run['status'] not in TERMINAL:
            # A network error or deadline cannot leave a paid actor running indefinitely.
            fetch(f"{API}/actor-runs/{run['id']}/abort", token=token, payload={})
    record.update(status=run['status'], actual_charge_usd=run.get('usageTotalUsd'),
                  charge_snapshot_at=datetime.now(UTC).isoformat(),
                  charged_event_counts=run.get('chargedEventCounts', {}))
    if journal:
        journal(record)
    if run['status'] != 'SUCCEEDED':
        raise SourceError('Actor ended ' + run['status'] + '; see run ' + run['id'])
    rows, offset = [], 0
    while offset < max_items:
        batch = fetch(f"{API}/datasets/{run['defaultDatasetId']}/items?clean=true&offset={offset}&limit={min(100,max_items-offset)}",
                      token=token)
        if not isinstance(batch, list):
            raise SourceError('Dataset is not an array')
        rows.extend(batch)
        if len(batch) < min(100, max_items-offset):
            break
        offset += len(batch)
    return rows, record


def parse_date(value, now):
    value = str(value or '').strip()
    if not value:
        return ''
    try:
        parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    except ValueError:
        try:
            parsed = email.utils.parsedate_to_datetime(value)
        except (ValueError, TypeError):
            return ''  # Relative text is preserved separately, never treated as an original date.
    if not parsed.tzinfo:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC).isoformat()


def pick(row, *keys):
    for key in keys:
        if row.get(key) not in (None, '', [], {}):
            return row[key]
    return ''


def normalize(row, source, now, project=False):
    if not isinstance(row, dict) or row.get('error') or row.get('isExpired') or row.get('_sample') or row.get('_diagnostic') or row.get('ok') is False:
        return None
    company = pick(row, 'companyName', 'company_name', 'company', 'organization', 'organization_name', 'employer')
    if isinstance(company, dict):
        company = company.get('name', '')
    title = plain(pick(row, 'title', 'positionName', 'jobTitle', 'job_title'))
    source_url = canonical(pick(row, 'link', 'url', 'jobUrl', 'job_url', 'source_url'))
    app_url = canonical(pick(row, 'externalApplyLink', 'applyUrl', 'apply_url', 'applicationUrl')) or source_url
    if not title or not source_url:
        return None
    desc = plain(pick(row, 'description', 'descriptionText', 'descriptionHtml', 'descriptionHTML', 'description_text', 'jobDescription'))
    location = plain(pick(row, 'location', 'candidate_required_location', 'locations_derived', 'jobLocation', 'locations'))
    employment = plain(pick(row, 'jobType', 'employmentType', 'employmentTypes', 'job_type', 'employment_type', 'ai_employment_type'))
    setting = plain(pick(row, 'jobSetting', 'workplaceType', 'workplaceTypes', 'work_arrangement', 'ai_work_arrangement'))
    salary = plain(pick(row, 'salaryInfo', 'salary', 'salaryText', 'compensation', 'salary_raw'))
    text = f'{title} {desc} {employment} {setting} {location}'
    low = text.lower()
    contract = bool(re.search(r'\b(?:contract(?:or|ual)?|freelance|c2c|corp.to.corp|temporary)\b', title+' '+employment, re.I))
    # Description-only signals must refer to the engagement, not e.g. vendor contract management.
    contract |= bool(re.search(r'(?:\b\d+[ -]month.{0,20}contract|\bcontract (?:role|position|opportunity)|\bemployment (?:type|status)\s*:?\s*contract|\bc2c\b|\bcorp.to.corp\b)', low))
    if re.search(r'\b(?:full.time|permanent)\b', employment, re.I) and not re.search(r'contract|temporary', employment, re.I):
        contract = False
    no_c2c = bool(re.search(r'(?:no|not|without|unable to|cannot|can\x27t|do not).{0,35}(?:c2c|corp.to.corp)|(?:c2c|corp.to.corp).{0,20}(?:not (?:accepted|available|allowed)|prohibited)', low))
    c2c = 'not accepted' if no_c2c else ('explicitly accepted' if re.search(r'\bc2c\b|corp.to.corp', low) else 'unknown')
    w2_only = bool(re.search(r'\bw[ -]?2\s*(?:only|required)\b', low))
    w2_listed = bool(re.search(r'\bw[ -]?2\b', low))
    w2 = w2_only or (w2_listed and c2c != 'explicitly accepted')
    if w2_only:
        c2c = 'not accepted'
    remote = bool(re.search(r'\bremote\b|work from (?:home|anywhere)', location+' '+setting+' '+title+' '+desc, re.I))
    hybrid = bool(re.search(r'\bhybrid\b|\b\d+ days? (?:in.{0,10}office|onsite|on.site)', low))
    onsite = bool(re.search(r'\b(?:on.site|onsite) (?:only|required)\b|\bnot remote\b', low))
    arrangement = 'hybrid' if hybrid else ('on-site' if onsite else ('remote' if remote else 'unknown'))
    us = bool(re.search(r'\b(?:united states|usa|u\.s\.|us only|us remote|us-based|us based|cst|est|pst|america)\b', low))
    world = bool(re.search(r'\b(?:worldwide|anywhere|global remote)\b', location+' '+desc, re.I))
    geography = 'US' if us else ('worldwide' if world else 'unconfirmed / non-US')
    restrictions = [s.strip() for s in re.split(r'(?<=[.;])\s+', desc)
                    if re.search(r'(?:must (?:reside|live|be (?:based|located))|citizen|work authori|no sponsorship|within the (?:us|united states)|us.only|security clearance|work.{0,15}abroad)', s, re.I)]
    if row.get('location_requirements'):
        restrictions.append('Source location requirements: '+plain(row['location_requirements']))
    rate = None
    pay_text = salary or desc
    match = re.search(r'(?:USD\s*|\$)\s*(\d{2,3}(?:\.\d{1,2})?)(?:\s*[-–]\s*\$?\s*\d{2,3}(?:\.\d{1,2})?)?\s*(?:/\s*(?:h(?:ou)?r|hour)|per hour|an hour|hourly)', pay_text, re.I)
    if row.get('_salary_estimate'):
        match = None
    if match and not re.search(r'\b(?:CAD|AUD|NZD)\b', pay_text[max(0, match.start()-10):match.end()+10], re.I):
        rate = float(match[1])
    skills = sorted(set(m.group().lower() for m in re.finditer(SKILLS, title+' '+desc, re.I)))
    if not skills:
        return None
    agency = bool(re.search(AGENCIES, str(company), re.I) or re.search(r'our (?:client|customer)\b|on behalf of (?:our|a) client', desc, re.I))
    classification = 'agency / client unverified' if agency else 'unverified employer'
    evidence = 'Posting names agency or describes its client; no confidential client inferred' if agency else 'Employer identity not independently verified'
    if project:
        pipeline, tier = 'published_project_need', 'project opportunity'
        classification = 'published buyer notice'
        evidence = 'Official procurement feed publishes the named buyer and open tender: '+source_url
    elif contract and arrangement == 'remote' and c2c == 'explicitly accepted' and rate is not None and rate >= 100 and geography in ('US', 'worldwide'):
        pipeline, tier = 'contract', '1 - remote C2C USD100+/hr'
    elif contract and arrangement == 'remote' and not w2 and c2c != 'not accepted' and (rate is None or rate >= 100):
        pipeline, tier = 'contract', '2 - remote contract; terms to verify'
    else:
        pipeline, tier = 'secondary', ('3 - W2 / C2C excluded' if w2 or no_c2c else
                                     '4 - lower-rate contract' if contract and rate is not None and rate < 100 else
                                     '5 - hybrid / on-site / remote unknown' if contract else '6 - permanent / contract unconfirmed')
    duration = re.search(r'\b\d+\s*(?:[-–]\s*\d+\s*)?(?:month|week|year)s?\b', desc, re.I)
    contact = sorted(set(re.findall(r'\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b', desc, re.I)))
    source_date = pick(row, 'postingDateParsed', 'date_posted', 'datePosted', 'publication_date', 'date', 'postedDate', 'postedAt')
    return dict(title=title, company_agency=plain(company), source=source,
                source_job_id=plain(pick(row, 'id', 'jobId', 'job_id', 'requisitionId')),
                source_posted_at=parse_date(source_date, now), source_date_text=plain(row.get('postedAt') or source_date),
                first_seen=now.isoformat(), pay=salary or (match[0] if match else 'unknown'),
                hourly_min_usd=rate if rate is not None else '', contract_status=('W2 contract' if w2_listed else 'contract') if contract else 'unconfirmed / permanent',
                c2c_status=c2c, duration=duration[0] if duration else 'unknown',
                remote_location=location or 'unknown', work_arrangement=arrangement,
                work_abroad_restrictions=' | '.join(restrictions)[:2000] or 'not stated; verify before working abroad',
                geography=geography, application_url=app_url, source_url=source_url,
                public_recruiter_contact='; '.join(contact), fit_tier=tier,
                fit_reason='Skills: '+', '.join(skills)+f'; {arrangement}; {geography}; C2C {c2c}',
                pipeline=pipeline, direct_client_classification=classification,
                direct_client_evidence=evidence, official_employer_url='', _description=desc)


def collect_feed(spec):
    if spec['kind'] == 'sam':
        return collect_sam(spec)
    raw = fetch(spec['url'], raw=True)
    if spec['kind'] == 'remotive':
        data = json.loads(raw)
        if not isinstance(data.get('jobs'), list):
            raise SourceError('Remotive schema changed')
        return data['jobs'][:1000]
    if spec['kind'] == 'ocds':
        data = json.loads(raw)
        rows = []
        if not isinstance(data.get('releases'), list):
            raise SourceError('OCDS schema changed')
        for package in data['releases']:
            t = package.get('tender', {})
            deadline = t.get('tenderPeriod', {}).get('endDate', '')
            expired = t.get('status') != 'active' or not deadline
            parsed_deadline = parse_date(deadline, datetime.now(UTC))
            expired |= not parsed_deadline or parsed_deadline < datetime.now(UTC).isoformat()
            notices = [doc.get('url', '') for doc in t.get('documents', [])
                       if doc.get('documentType') == 'tenderNotice']
            rows.append({'id': package.get('ocid'), 'title': t.get('title'),
                         'company': package.get('buyer', {}).get('name'),
                         'url': notices[0] if notices else '',
                         'description': plain(t.get('description'))+'; response deadline '+deadline,
                         'location': 'United Kingdom; delivery eligibility unverified', 'date': package.get('date'),
                         'salary': t.get('value', {}), 'isExpired': expired})
        return rows
    root = ET.fromstring(raw)
    rows = []
    for item in root.findall('.//item')[:1000]:
        title = item.findtext('title', '')
        company, sep, role = title.partition(': ')
        rows.append({'title': role if sep else title, 'company': company if sep else '',
                     'url': item.findtext('link'), 'id': item.findtext('guid'),
                     'date': item.findtext('pubDate'),
                     'description': item.findtext('description', ''), 'location': 'Remote'})
    return rows


def collect_sam(spec):
    key = load_secret('SAM_API_KEY')
    if not key:
        raise CredentialMissing('SAM_API_KEY is not configured; US federal solicitations have not been searched')
    if spec['url'] != 'https://api.sam.gov/opportunities/v2/search':
        raise SourceError('Refused SAM credential use outside the official API')
    now = datetime.now(UTC)
    rows = {}
    # Deliberately bounded, title-based discovery; not an exhaustive procurement search.
    for title in spec.get('titles', ['software', 'cloud', 'artificial intelligence'])[:3]:
        for notice_type in ('o', 'k'):
            query = urlencode({'api_key': key, 'postedFrom': (now-timedelta(days=7)).strftime('%m/%d/%Y'),
                               'postedTo': now.strftime('%m/%d/%Y'), 'ptype': notice_type,
                               'title': title, 'limit': 100, 'offset': 0})
            data = fetch(spec['url']+'?'+query, attempts=1)
            # Query-string authentication is required by SAM; never persist a key
            # echoed in a provider response or its pagination links.
            data = json.loads(json.dumps(data).replace(key, '[REDACTED]'))
            if not isinstance(data.get('opportunitiesData'), list):
                raise SourceError('SAM opportunities schema changed')
            for notice in data['opportunitiesData']:
                if str(notice.get('active', '')).lower() != 'yes' or notice.get('type') not in ('Solicitation', 'Combined Synopsis/Solicitation'):
                    continue
                deadline = parse_date(notice.get('responseDeadLine') or notice.get('reponseDeadLine'), now)
                if not deadline or deadline <= now.isoformat():
                    continue
                identifier = notice.get('noticeId')
                url = canonical(notice.get('uiLink'))
                if not identifier or not url or urlsplit(url).hostname not in ('sam.gov', 'www.sam.gov'):
                    continue
                contacts = notice.get('pointOfContact') or []
                contact_text = '; '.join(plain(c.get('fullName') or c.get('fullname'))+' '+plain(c.get('email')) for c in contacts if isinstance(c, dict))
                performance = notice.get('placeOfPerformance') or {}
                country = performance.get('country') or {}
                country_name = plain(country.get('name') or country.get('code')) if isinstance(country, dict) else plain(country)
                if country_name.upper() in ('USA', 'US'):
                    country_name = 'United States'
                # Description is an API link, not source text. Do not fetch or export its credential-bearing URL.
                rows[identifier] = {'id': identifier, 'title': notice.get('title'),
                    'company': notice.get('fullParentPathName') or notice.get('department') or 'US federal buyer',
                    'url': url, 'date': notice.get('postedDate'),
                    'location': (country_name or 'US federal procurement; place of performance unconfirmed')+'; vendor eligibility must be verified',
                    'description': f"US federal solicitation. Response deadline {deadline}. Set-aside: {plain(notice.get('typeOfSetAsideDescription')) or 'verify in notice'}. Public procurement contacts: {contact_text}",
                    'isExpired': False}
    return list(rows.values())


def words(value):
    return set(re.findall(r'\b[a-z0-9]+\b', value.lower()))


class State:
    def __init__(self, path):
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(path)
        self.db.execute('CREATE TABLE IF NOT EXISTS jobs (id INTEGER PRIMARY KEY, first_seen TEXT, last_seen TEXT, data TEXT)')
        self.db.execute('CREATE TABLE IF NOT EXISTS aliases (alias TEXT PRIMARY KEY, job_id INTEGER)')
        self.db.execute('CREATE TABLE IF NOT EXISTS runs (run_date TEXT PRIMARY KEY, completed TEXT)')
        columns = {row[1] for row in self.db.execute('PRAGMA table_info(jobs)')}
        for column in ('match_key', 'title_key'):
            if column not in columns:
                self.db.execute(f'ALTER TABLE jobs ADD COLUMN {column} TEXT')
        for jid, blob in self.db.execute('SELECT id,data FROM jobs WHERE title_key IS NULL').fetchall():
            self.db.execute('UPDATE jobs SET match_key=?, title_key=? WHERE id=?', (*self.keys(json.loads(blob)), jid))
        self.db.execute('CREATE INDEX IF NOT EXISTS jobs_match ON jobs(match_key)')
        self.db.execute('CREATE INDEX IF NOT EXISTS jobs_title ON jobs(title_key)')

    @staticmethod
    def keys(job):
        title = re.sub(r'\W+', '', job['title'].casefold())
        return json.dumps([job['company_agency'].casefold(), job['title'].casefold(), job['remote_location'].casefold()]), title

    @staticmethod
    def aliases(job):
        result = {'url:'+canonical(job['source_url']), 'url:'+canonical(job['application_url'])}
        if job['source_job_id']:
            result.add('id:'+job['source']+':'+job['source_job_id'])
        # Employer/title alone is deliberately not an unconditional alias: multiple requisitions can coexist.
        return {x for x in result if x not in ('url:', 'id:')}

    def observe(self, job):
        existing = None
        for alias in self.aliases(job):
            found = self.db.execute('SELECT job_id FROM aliases WHERE alias=?', (alias,)).fetchone()
            if found:
                existing = found[0]
                break
        if existing is None:
            for jid, blob in self.db.execute('SELECT id,data FROM jobs WHERE match_key=? OR title_key=?', self.keys(job)):
                old = json.loads(blob)
                same_employer = plain(old['company_agency']).casefold() == plain(job['company_agency']).casefold()
                same_title = plain(old['title']).casefold() == plain(job['title']).casefold()
                a, b = words(old.get('_description', '')), words(job.get('_description', ''))
                similar = len(a & b) / max(1, len(a | b)) >= .90 and min(len(a), len(b)) >= 40
                same_location = old['remote_location'].casefold() == job['remote_location'].casefold()
                if same_employer and same_title and same_location and similar:
                    existing = jid
                    break
                # Cross-agency repost: require an almost identical long description and very similar title.
                if min(len(a), len(b)) >= 100 and len(a & b) / max(1, len(a | b)) >= .97 and SequenceMatcher(None, old['title'].lower(), job['title'].lower()).ratio() >= .95:
                    existing = jid
                    break
        new = existing is None
        if new:
            cur = self.db.execute('INSERT INTO jobs(first_seen,last_seen,data,match_key,title_key) VALUES(?,?,?,?,?)',
                                  (job['first_seen'], job['first_seen'], json.dumps(job), *self.keys(job)))
            existing = cur.lastrowid
        else:
            job['first_seen'] = self.db.execute('SELECT first_seen FROM jobs WHERE id=?', (existing,)).fetchone()[0]
            self.db.execute('UPDATE jobs SET last_seen=? WHERE id=?', (datetime.now(UTC).isoformat(), existing))
        for alias in self.aliases(job):
            self.db.execute('INSERT OR IGNORE INTO aliases VALUES (?,?)', (alias, existing))
        return new

    def seed(self):
        # Already reported in the preceding search. Never present it as a new lead.
        seed = {'source': 'LinkedIn', 'source_job_id': '4481766456',
                'source_url': 'https://www.linkedin.com/jobs/view/4481766456',
                'application_url': 'https://www.linkedin.com/jobs/view/4481766456',
                'title': 'AI/ML Platform Engineer', 'company_agency': 'Motion Recruitment',
                'first_seen': '2026-10-26T13:00:00+00:00', 'remote_location': 'Remote CST', '_description': ''}
        self.observe(seed)
        self.db.commit()


def enrich(jobs, max_checks=15):
    checked = 0
    for job in jobs:
        if checked >= max_checks:
            break
        if job['source'] != 'Employer ATS discovery' or job['direct_client_classification'].startswith('agency'):
            continue
        url = job['application_url']
        host = urlsplit(url).hostname or ''
        if host in {'www.linkedin.com', 'linkedin.com', 'www.indeed.com', 'indeed.com', 'www.dice.com', 'dice.com'}:
            continue
        checked += 1
        try:
            page = plain(fetch(url, raw=True, timeout=8, attempts=1).decode('utf-8', errors='replace'))
            if job['title'].lower() not in page.lower() or job['company_agency'].lower() not in page.lower():
                continue
            job['official_employer_url'] = url
            job['direct_client_classification'] = 'employer posting verified; agency status to confirm'
            job['direct_client_evidence'] = 'Live ATS page contains the named employer and title: ' + url
        except (SourceError, ValueError):
            continue
    # Agencies are linked only to a verified ATS page with a distinctive long description match.
    official = [j for j in jobs if j['official_employer_url']]
    for job in jobs:
        if not job['direct_client_classification'].startswith('agency'):
            for target in official:
                if canonical(job['application_url']) == canonical(target['official_employer_url']) and job['company_agency'].casefold() == target['company_agency'].casefold():
                    for key in ('official_employer_url', 'direct_client_classification', 'direct_client_evidence'):
                        job[key] = target[key]
                    break
            continue
        a = words(job['_description'])
        for target in official:
            b = words(target['_description'])
            if min(len(a), len(b)) >= 100 and len(a & b)/max(1, len(a | b)) >= .95 and job['title'].lower() == target['title'].lower():
                job['official_employer_url'] = target['official_employer_url']
                job['direct_client_evidence'] = 'Matching title and >=95% description token overlap with verified ATS page; review correspondence: '+target['official_employer_url']
                break


def csv_cell(value):
    value = str(value)
    return "'"+value if value.lstrip().startswith(('=', '+', '-', '@', '\t', '\r')) else value


def report(out, jobs, coverage, counts, runs, config, now, mode):
    out.mkdir(parents=True, exist_ok=True)
    def write_csv(name, subset):
        with (out/name).open('w', newline='', encoding='utf-8') as f:
            w = csv.DictWriter(f, fieldnames=FIELDS, extrasaction='ignore')
            w.writeheader()
            w.writerows({k: csv_cell(j.get(k, '')) for k in FIELDS} for j in subset)
    jobs.sort(key=lambda j: (j['fit_tier'], j['geography'] != 'US', not bool(j['official_employer_url']), j['title']))
    primary = [j for j in jobs if j['pipeline'] == 'contract']
    projects = [j for j in jobs if j['pipeline'] == 'published_project_need']
    secondary = [j for j in jobs if j['pipeline'] == 'secondary']
    write_csv('all-new-leads.csv', jobs)
    write_csv('contracts.csv', primary)
    write_csv('secondary.csv', secondary)
    write_csv('project-needs.csv', projects)
    summary = {'mode': mode, 'created_at': now.isoformat(), **counts,
               'new_remote_contracts': len(primary), 'secondary': len(secondary),
               'published_project_needs': len(projects), 'target': config['target'],
               'shortfall': max(0, config['target']-len(primary)),
               'source_coverage': coverage, 'actor_runs': runs}
    (out/'summary.json').write_text(json.dumps(summary, indent=2)+'\n', encoding='utf-8')
    lines = [f'# Contract search — {now.astimezone(ZoneInfo("America/Chicago")).date()}', '',
             f'Mode: **{mode}**. New remote contracts: **{len(primary)} / {config["target"]}**. Secondary roles: **{len(secondary)}**. Published project needs: **{len(projects)}**.',
             f'Raw rows: {counts["raw"]}; normalized relevant rows: {counts["relevant"]}; unique new relevant leads: {counts["new_unique"]}; duplicates: {counts["duplicates"]}; stale: {counts["stale"]}; rejected: {counts["rejected"]}.', '',
             'First-seen means new to this collector, not newly published. Unknown original dates stay unknown. The 7-day overlap includes weekend postings on Monday; missed runs longer than 7 days require backfill.', '',
             '## Top 10 remote contracts', '']
    for i, j in enumerate(primary[:10], 1):
        title = j['title'].replace('[', '').replace(']', '').replace('\n', ' ')
        lines.append(f'{i}. [{title}]({j["source_url"]}) — {j["company_agency"]}; {j["pay"]}; {j["fit_tier"]}; {j["source"]}. {j["direct_client_classification"]}.')
    if not primary:
        lines.append('No new qualifying remote contracts in this run.')
    if summary['shortfall']:
        lines.extend(['', f'**Shortfall: {summary["shortfall"]}.** Source failures, bounded search limits, stale postings, deduplication and relevance/contract filters constrain the count. Secondary roles and project notices do not fill the contract target. No inferred prospects are counted.'])
    lines.extend(['', '## Source coverage', '', '| Source | Status | Raw rows | Detail |', '|---|---|---:|---|'])
    for c in coverage:
        lines.append(f'| {c["source"]} | {c["status"]} | {c.get("raw", 0)} | {c.get("detail", "")} |')
    lines.extend(['', f"Daily paid-run allowance ${config.get('daily_cap_usd', 4):g}; configured daily caps ${sum(s['cap_usd'] for s in config.get('actors', [])):.2f}; smoke cap $0.15 per source. Reservations include uncertain charges. Provider charge snapshots are in summary.json and can settle after completion. Actor caps are spending limits, not expected costs. No applications or outreach are sent.", '',
                  'Remotive listings are delayed by its public API. We Work Remotely and all other sources are credited with original posting links. Published procurement notices are separate buying opportunities; delivery and vendor eligibility must be checked.'])
    (out/'summary.md').write_text('\n'.join(lines)+'\n', encoding='utf-8')
    print(json.dumps({k: summary[k] for k in ('mode', 'raw', 'new_unique', 'new_remote_contracts', 'secondary', 'published_project_needs', 'shortfall')}))
    return summary


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--mode', choices=['smoke', 'daily', 'public'], default='smoke', help='smoke: selected source, $0.15 cap; daily: configured sources, $4 Chicago-day allowance; public: no paid actors')
    p.add_argument('--config', default=str(Path(__file__).resolve().with_name('config.json')))
    p.add_argument('--state', default='state/seen.sqlite3')
    p.add_argument('--output', default='output/latest')
    p.add_argument('--source', help='Configured actor name; select one source for smoke validation')
    p.add_argument('--force', action='store_true', help='Allow another collection; never bypasses the daily paid allowance')
    args = p.parse_args(argv)
    config = json.loads(Path(args.config).read_text(encoding='utf-8'))
    if any(not isinstance(s['cap_usd'], (int,float)) or not 0 < s['cap_usd'] <= config['daily_cap_usd'] or type(s['max_items']) is not int or s['max_items'] < 1 for s in config['actors']):
        p.error('Actor caps and item limits must be positive and bounded')
    if sum(s['cap_usd'] for s in config['actors']) > config['daily_cap_usd'] + 1e-9:
        p.error('Actor caps exceed daily budget')
    if args.source and (args.mode != 'smoke' or args.source not in {s['name'] for s in config['actors']}):
        p.error('--source must name a configured actor and requires smoke mode')
    now = datetime.now(UTC)
    day = str(now.astimezone(ZoneInfo('America/Chicago')).date())
    state = State(args.state)
    state.seed()
    if args.mode == 'daily' and not args.force and state.db.execute('SELECT 1 FROM runs WHERE run_date=?', (day,)).fetchone():
        print('Daily collection already completed for Chicago date '+day+'; skipping without spending.')
        state.db.close()
        return 0
    out = Path(args.output)
    out.mkdir(parents=True, exist_ok=True)
    runs, coverage, rows = [], [], []
    token = token_from_local()
    budget_path = Path(args.state).with_name('budget.sqlite3')
    persist_lock = threading.Lock()
    def persist_budget():
        if os.environ.get('CONTRACT_BUDGET_GIT_SYNC') == '1':
            with persist_lock:
                directory = str(budget_path.parent.resolve())
                for command in (['add', 'budget.sqlite3'], ['-c','user.name=contract-search runner','-c','user.email=contract-search@users.noreply.github.com','commit','-m','Reserve paid collection allowance'], ['push','origin','HEAD:runner-state']):
                    result = subprocess.run(['git','-C',directory]+command, capture_output=True)
                    if result.returncode:
                        raise SourceError('Could not persist paid allowance; no actor started')
    budget = Budget(budget_path, config['daily_cap_usd'], day, persist_budget)

    journal_lock = threading.Lock()
    def journal(record):
        with journal_lock:
            for old in runs:
                if old['run_id'] == record['run_id']:
                    old.update(record)
                    break
            else:
                runs.append(dict(record))
            (out/'actor-runs.json').write_text(json.dumps(runs, indent=2)+'\n', encoding='utf-8')
    selected = ([next(s for s in config['actors'] if s['name'] == args.source)] if args.source else config['actors'][:1]) if args.mode == 'smoke' else config['actors'] if args.mode == 'daily' else []
    def collect_source(spec):
        batch, errors, records = [], [], []
        if spec.get('enabled') is False and args.mode != 'smoke':
            return spec, batch, records, ['Awaiting live validation']
        for variant in variants(spec, args.mode == 'smoke'):
            try:
                data, record = collect_actor(variant, token, args.mode == 'smoke', journal, budget)
                data = json.loads(json.dumps(data).replace(token, '[REDACTED]')) if token else data
                batch.extend(adapt(r, spec.get('adapter')) for r in data)
                records.append(record)
            except (SourceError, KeyError, TypeError, ValueError) as exc:
                errors.append(str(exc) if isinstance(exc, SourceError) else 'Provider schema changed; adapter requires review')
        return spec, batch, records, errors
    with ThreadPoolExecutor(max_workers=3) as pool:
        for spec, batch, records, errors in pool.map(collect_source, selected):
            rows.extend((spec['name'], r, False) for r in batch)
            status = 'not validated' if spec.get('enabled') is False and args.mode != 'smoke' else 'failed' if errors else 'ok'
            detail = '; '.join(errors) if errors else 'Capped runs '+', '.join(r['run_id'] for r in records)
            if spec.get('adapter') == 'staffing': detail += '; provider ATS index; end client unverified'
            coverage.append({'source':spec['name'], 'status':status, 'raw':len(batch), 'detail':detail})
    if args.mode != 'smoke':
        for spec in config['feeds']:
            if spec.get('enabled') is False:
                coverage.append({'source': spec['name'], 'status': 'disabled', 'raw': 0, 'detail': spec.get('reason', 'Disabled by configuration')})
                continue
            try:
                batch = collect_feed(spec)
                rows.extend((spec['name'], r, spec['kind'] in ('ocds', 'sam')) for r in batch)
                coverage.append({'source': spec['name'], 'status': 'ok', 'raw': len(batch), **({'detail': 'Bounded discovery: 3 titles, 2 solicitation types, first 100 results per query; federal projects, not individual jobs'} if spec['kind'] == 'sam' else {})})
            except CredentialMissing as exc:
                coverage.append({'source': spec['name'], 'status': 'not configured', 'raw': 0, 'detail': str(exc)})
            except (SourceError, ValueError, KeyError, ET.ParseError, TypeError) as exc:
                detail = str(exc) if isinstance(exc, SourceError) else 'Feed unavailable or schema changed'
                coverage.append({'source': spec['name'], 'status': 'failed', 'raw': 0, 'detail': detail})
        coverage.extend({'source': k, 'status': 'not configured', 'raw': 0, 'detail': v} for k, v in config.get('unconfigured_sources', {}).items())
    counts = dict(raw=len(rows), relevant=0, new_unique=0, duplicates=0, stale=0, rejected=0)
    jobs, candidates = [], []
    for source, row, project in rows:
        job = normalize(row, source, now, project)
        if not job:
            counts['rejected'] += 1
            continue
        counts['relevant'] += 1
        if job['source_posted_at'] and datetime.fromisoformat(job['source_posted_at']) < now-timedelta(days=config['max_age_days']):
            counts['stale'] += 1
            continue
        candidates.append(job)
    for item in coverage:
        item['retained'] = sum(j['source'] == item['source'] for j in candidates)
    enrich(candidates, max_checks=0 if args.mode == 'smoke' else 15)
    for job in candidates:
        if state.observe(job):
            jobs.append(job)
        else:
            counts['duplicates'] += 1
    counts['new_unique'] = len(jobs)
    summary = report(out, jobs, coverage, counts, runs, config, now, args.mode)
    if args.mode == 'daily' and any(c['status'] == 'ok' for c in coverage):
        state.db.execute('INSERT OR REPLACE INTO runs VALUES (?,?)', (day, now.isoformat()))
    state.db.commit()
    state.db.close()
    return 2 if any(c['status'] == 'failed' for c in coverage) else 0


if __name__ == '__main__':
    sys.exit(main())
