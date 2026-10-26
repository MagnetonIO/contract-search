#!/usr/bin/env python3
"""Bounded contract search. Run python3 runner.py --help for local usage."""
import argparse
import csv
from datetime import datetime, timedelta, timezone
from difflib import SequenceMatcher
import email.utils
import hashlib
import html
import json
import os
from pathlib import Path
import re
import sqlite3
import subprocess
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from urllib.request import Request, HTTPRedirectHandler, build_opener
import xml.etree.ElementTree as ET
from zoneinfo import ZoneInfo

UTC = timezone.utc
API = 'https://api.apify.com/v2'
TERMINAL = {'SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT'}
SKILLS = r'\b(?:software|architect|aws|gcp|kubernetes|golang|typescript|react|next\.?js|python|java|rust|data engineer|devops|sre|platform engineer|machine learning|ai engineer|ai agent)\b'
AGENCIES = r'\b(?:recruitment|recruiting|staffing|talent|tek.?systems|insight global|robert half|randstad|kforce|apex systems|motion recruitment|dice job bot)\b'
FIELDS = ['title', 'company_agency', 'source', 'source_job_id', 'source_posted_at',
          'source_date_text', 'first_seen', 'pay', 'hourly_min_usd', 'contract_status',
          'c2c_status', 'duration', 'remote_location', 'work_arrangement',
          'work_abroad_restrictions', 'geography', 'application_url', 'source_url',
          'public_recruiter_contact', 'fit_tier', 'fit_reason', 'pipeline',
          'direct_client_classification', 'direct_client_evidence', 'official_employer_url']


class SourceError(Exception):
    pass


class SafeRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if req.has_header('Authorization') and urlsplit(newurl).netloc != urlsplit(req.full_url).netloc:
            raise SourceError('Refused credential-bearing redirect to another host')
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
        keep = [(k, v) for k, v in parse_qsl(p.query) if k.lower() in
                {'jk', 'vjk', 'jobid', 'job_id', 'gh_jid', 'id', 'reqid'}]
        path = p.path.rstrip('/')
        m = re.search(r'/jobs/view/(?:[^/]*-)?(\d+)', path)
        if 'linkedin.com' in p.hostname and m:
            path = '/jobs/view/' + m[1]
        return urlunsplit(('https', p.netloc.lower(), path, urlencode(sorted(keep)), ''))
    except ValueError:
        return ''


def fetch(url, *, token='', payload=None, method=None, raw=False):
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
    for attempt in range(3 if data is None else 1):
        try:
            with build_opener(SafeRedirect()).open(req, timeout=30) as response:
                body = response.read(25_000_001)
                if len(body) > 25_000_000:
                    raise SourceError('Response exceeded 25 MB bound')
                return body if raw else json.loads(body)
        except HTTPError as exc:
            if data is None and exc.code in (429, 500, 502, 503, 504) and attempt < 2:
                time.sleep(2 ** attempt)
                continue
            raise SourceError(f'HTTP {exc.code}') from None
        except (URLError, TimeoutError, json.JSONDecodeError):
            if data is None and attempt < 2:
                time.sleep(2 ** attempt)
                continue
            raise SourceError('Network timeout, connection failure, or invalid JSON') from None


def token_from_local():
    if os.getenv('APIFY_TOKEN'):
        return os.environ['APIFY_TOKEN'].strip()
    if sys.platform == 'darwin':
        p = subprocess.run(['security', 'find-generic-password', '-s', 'APIFY_TOKEN', '-w'],
                           capture_output=True, text=True)
        if p.returncode == 0:
            return p.stdout.strip()
    return ''


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


def collect_actor(spec, token, smoke=False, journal=None):
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
    max_items = 3 if smoke else spec['max_items']
    if smoke:
        body['urls'] = body.get('urls', [])[:1]
        body['limitPerSource'] = 3
    validate_input(build.get('actorDefinition', {}).get('input'), body)
    if pricing.get('minimalMaxTotalChargeUsd') and pricing['minimalMaxTotalChargeUsd'] > cap:
        raise SourceError('Actor minimum charge cap exceeds configured budget')
    opts = urlencode({'maxTotalChargeUsd': cap, 'maxItems': max_items,
                      'timeout': 480 if not smoke else 180, 'memory': 512,
                      'build': build['buildNumber']})
    run = fetch(f'{API}/acts/{actor}/runs?{opts}', token=token, payload=body)['data']
    record = {'source': spec['name'], 'run_id': run['id'], 'cap_usd': cap,
              'build': build['buildNumber'], 'status': run['status']}
    if journal:
        journal(record)
    deadline = time.monotonic() + (540 if not smoke else 240)
    try:
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
    if not isinstance(row, dict) or row.get('error') or row.get('isExpired'):
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
    employment = plain(pick(row, 'jobType', 'employmentType', 'employmentTypes', 'job_type', 'ai_employment_type', 'employment_type'))
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
    w2 = bool(re.search(r'\bw[ -]?2\s*(?:only|required)\b', low))
    if w2:
        c2c = 'not accepted'
    remote = bool(re.search(r'\bremote\b|work from (?:home|anywhere)', location+' '+setting+' '+title+' '+desc, re.I))
    hybrid = bool(re.search(r'\bhybrid\b|\b\d+ days? (?:in.{0,10}office|onsite|on.site)', low))
    onsite = bool(re.search(r'\b(?:on.site|onsite) (?:only|required)\b|\bnot remote\b', low))
    arrangement = 'hybrid' if hybrid else ('on-site' if onsite else ('remote' if remote else 'unknown'))
    us = bool(re.search(r'\b(?:united states|usa|u\.s\.|us only|us remote|us-based|us based|cst|est|pst|america)\b', low))
    world = bool(re.search(r'\b(?:worldwide|anywhere|global remote)\b', location+' '+desc, re.I))
    geography = 'US' if us else ('worldwide' if world else 'unconfirmed / non-US')
    restrictions = [s.strip() for s in re.split(r'(?<=[.;])\s+', desc)
                    if re.search(r'(?:must (?:reside|live|be (?:based|located))|citizenship|work authori|no sponsorship|within the (?:us|united states)|us.only|security clearance|work.{0,15}abroad)', s, re.I)]
    rate = None
    pay_text = salary or desc
    match = re.search(r'(?:USD\s*|\$)\s*(\d{2,3}(?:\.\d{1,2})?)(?:\s*[-–]\s*\$?\s*\d{2,3}(?:\.\d{1,2})?)?\s*(?:/\s*(?:h(?:ou)?r|hour)|per hour|an hour|hourly)', pay_text, re.I)
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
    source_date = pick(row, 'postingDateParsed', 'postedAt', 'date_posted', 'datePosted', 'publication_date', 'date', 'postedDate')
    return dict(title=title, company_agency=plain(company), source=source,
                source_job_id=plain(pick(row, 'id', 'jobId', 'job_id', 'requisitionId')),
                source_posted_at=parse_date(source_date, now), source_date_text=plain(source_date),
                first_seen=now.isoformat(), pay=salary or (match[0] if match else 'unknown'),
                hourly_min_usd=rate if rate is not None else '', contract_status='contract' if contract else 'unconfirmed / permanent',
                c2c_status=c2c, duration=duration[0] if duration else 'unknown',
                remote_location=location or 'unknown', work_arrangement=arrangement,
                work_abroad_restrictions=' | '.join(restrictions)[:2000] or 'not stated; verify before working abroad',
                geography=geography, application_url=app_url, source_url=source_url,
                public_recruiter_contact='; '.join(contact), fit_tier=tier,
                fit_reason='Skills: '+', '.join(skills)+f'; {arrangement}; {geography}; C2C {c2c}',
                pipeline=pipeline, direct_client_classification=classification,
                direct_client_evidence=evidence, official_employer_url='', _description=desc)


def collect_feed(spec):
    raw = fetch(spec['url'], raw=True)
    if spec['kind'] == 'remotive':
        data = json.loads(raw)
        if not isinstance(data.get('jobs'), list):
            raise SourceError('Remotive schema changed')
        return data['jobs'][:1000]
    if spec['kind'] == 'ocds':
        data = json.loads(raw)
        rows = []
        for package in data.get('releases', []):
            t = package.get('tender', {})
            deadline = t.get('tenderPeriod', {}).get('endDate', '')
            if t.get('status') not in ('active', 'planned') or not deadline:
                continue  # Awards and closed notices are not buying opportunities.
            if deadline < datetime.now(UTC).isoformat():
                continue
            if not re.search(SKILLS, plain(t), re.I):
                continue
            rows.append({'id': package.get('ocid'), 'title': t.get('title'),
                         'company': package.get('buyer', {}).get('name'),
                         'url': t.get('documents', [{}])[0].get('url', '') if t.get('documents') else '',
                         'description': plain(t.get('description'))+'; response deadline '+deadline,
                         'location': 'United Kingdom; delivery eligibility unverified', 'date': package.get('date'),
                         'salary': t.get('value', {})})
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


def words(value):
    return set(re.findall(r'\b[a-z0-9]+\b', value.lower()))


class State:
    def __init__(self, path):
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(path)
        self.db.execute('CREATE TABLE IF NOT EXISTS jobs (id INTEGER PRIMARY KEY, first_seen TEXT, last_seen TEXT, data TEXT)')
        self.db.execute('CREATE TABLE IF NOT EXISTS aliases (alias TEXT PRIMARY KEY, job_id INTEGER)')
        self.db.execute('CREATE TABLE IF NOT EXISTS runs (run_date TEXT PRIMARY KEY, completed TEXT)')

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
            for jid, blob in self.db.execute('SELECT id,data FROM jobs'):
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
            cur = self.db.execute('INSERT INTO jobs(first_seen,last_seen,data) VALUES(?,?,?)',
                                  (job['first_seen'], job['first_seen'], json.dumps(job)))
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
            page = plain(fetch(url, raw=True).decode('utf-8', errors='replace'))
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
        with (out/name).open('w', newline='') as f:
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
    (out/'summary.json').write_text(json.dumps(summary, indent=2)+'\n')
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
    lines.extend(['', 'Daily actor charge caps total $2; smoke cap $0.15. Actual charges, when provided by Apify, are in summary.json. Actor caps are spending limits, not expected costs. No applications or outreach are sent.', '',
                  'Remotive listings are delayed by its public API. We Work Remotely and all other sources are credited with original posting links. Published UK project notices are separate buying opportunities; delivery eligibility must be checked.'])
    (out/'summary.md').write_text('\n'.join(lines)+'\n')
    print(json.dumps({k: summary[k] for k in ('mode', 'raw', 'new_unique', 'new_remote_contracts', 'secondary', 'published_project_needs', 'shortfall')}))
    return summary


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--mode', choices=['smoke', 'daily', 'public'], default='smoke', help='smoke: one LinkedIn actor, <=3 rows, $0.15 cap; daily: configured sources, $2 total caps; public: no paid actors')
    p.add_argument('--config', default='config.json')
    p.add_argument('--state', default='state/seen.sqlite3')
    p.add_argument('--output', default='output/latest')
    p.add_argument('--force', action='store_true', help='Allow a second daily run today; can spend another daily budget')
    args = p.parse_args(argv)
    config = json.loads(Path(args.config).read_text())
    if sum(s['cap_usd'] for s in config['actors']) > config['daily_cap_usd'] + 1e-9:
        p.error('Actor caps exceed daily budget')
    now = datetime.now(UTC)
    day = str(now.astimezone(ZoneInfo('America/Chicago')).date())
    state = State(args.state)
    state.seed()
    if args.mode == 'daily' and not args.force and state.db.execute('SELECT 1 FROM runs WHERE run_date=?', (day,)).fetchone():
        print('Daily collection already completed for Chicago date '+day+'; skipping without spending.')
        return 0
    out = Path(args.output)
    out.mkdir(parents=True, exist_ok=True)
    runs, coverage, rows = [], [], []
    token = token_from_local()
    def journal(record):
        for old in runs:
            if old['run_id'] == record['run_id']:
                old.update(record)
                break
        else:
            runs.append(dict(record))
        (out/'actor-runs.json').write_text(json.dumps(runs, indent=2)+'\n')
    selected = config['actors'][:1] if args.mode == 'smoke' else config['actors'] if args.mode == 'daily' else []
    for spec in selected:
        try:
            batch, record = collect_actor(spec, token, args.mode == 'smoke', journal)
            # A provider echoing the credential must never put it into artifacts/state.
            batch = json.loads(json.dumps(batch).replace(token, '[REDACTED]')) if token else batch
            rows.extend((spec['name'], r, False) for r in batch)
            coverage.append({'source': spec['name'], 'status': 'ok', 'raw': len(batch), 'detail': 'Capped run '+record['run_id']})
        except (SourceError, KeyError, TypeError, ValueError) as exc:
            detail = str(exc) if isinstance(exc, SourceError) else 'Provider schema changed; adapter requires review'
            coverage.append({'source': spec['name'], 'status': 'failed', 'raw': 0, 'detail': detail})
    if args.mode != 'smoke':
        for spec in config['feeds']:
            try:
                batch = collect_feed(spec)
                rows.extend((spec['name'], r, spec['kind'] == 'ocds') for r in batch)
                coverage.append({'source': spec['name'], 'status': 'ok', 'raw': len(batch)})
            except (SourceError, ValueError, KeyError, ET.ParseError, TypeError):
                coverage.append({'source': spec['name'], 'status': 'failed', 'raw': 0, 'detail': 'Feed unavailable or schema changed'})
        coverage.extend({'source': k, 'status': 'not configured', 'raw': 0, 'detail': v} for k, v in config.get('unconfigured_sources', {}).items())
    counts = dict(raw=len(rows), relevant=0, new_unique=0, duplicates=0, stale=0, rejected=0)
    jobs = []
    for source, row, project in rows:
        job = normalize(row, source, now, project)
        if not job:
            counts['rejected'] += 1
            continue
        counts['relevant'] += 1
        if job['source_posted_at'] and datetime.fromisoformat(job['source_posted_at']) < now-timedelta(days=config['max_age_days']):
            counts['stale'] += 1
            continue
        if state.observe(job):
            jobs.append(job)
        else:
            counts['duplicates'] += 1
    enrich(jobs, max_checks=0 if args.mode == 'smoke' else 15)
    counts['new_unique'] = len(jobs)
    summary = report(out, jobs, coverage, counts, runs, config, now, args.mode)
    if args.mode == 'daily' and any(c['status'] == 'ok' for c in coverage):
        state.db.execute('INSERT OR REPLACE INTO runs VALUES (?,?)', (day, now.isoformat()))
    state.db.commit()
    state.db.close()
    return 2 if any(c['status'] == 'failed' for c in coverage) else 0


if __name__ == '__main__':
    sys.exit(main())
