#!/usr/bin/env python3
"""Export existing collector state for the authenticated web dashboard; never starts actors."""
import argparse
import sys
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import sqlite3
from urllib.parse import parse_qsl, urlencode, urlsplit

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from collectors import coverage_for_config


def lead_id(job):
    return hashlib.sha256(job['source_url'].encode('utf-8')).hexdigest()[:20]


def posting_key(url):
    parsed = urlsplit(url)
    linkedin = re.search(r'/jobs/view/(?:[^/]*-)?(\d+)', parsed.path)
    if parsed.hostname and (parsed.hostname == 'linkedin.com' or parsed.hostname.endswith('.linkedin.com')) and linkedin:
        return 'linkedin:' + linkedin[1]
    identity = [(key, value) for key, value in parse_qsl(parsed.query)
                if key.lower() in ('jk', 'jobid', 'job_id', 'id', 'gh_jid', 'reqid', 'jl')]
    return (parsed.hostname or '').lower() + parsed.path.rstrip('/') + '?' + urlencode(sorted(identity))


def classify_contacts(job):
    description = job.get('_description', '')
    result = []
    for email in re.findall(r'\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b', job.get('public_recruiter_contact', ''), re.I):
        at = description.lower().find(email.lower())
        context = description[max(0, at-240):at+120].lower() if at >= 0 else ''
        if re.search(r'accommodat|accessibility|disabilit|privacy|noreply|no-reply', email+' '+context, re.I):
            kind, detail = 'accessibility_only', 'This address appears in an accessibility, accommodation, or policy notice. Use the application route for hiring.'
        elif re.search(r'recruit|careers|hiring|talent', email, re.I) or re.search(r'(?:send|submit|email).{0,100}(?:resume|cv|application)', context):
            kind, detail = 'hiring', 'Publicly listed in the posting as a recruiting or application contact.'
        else:
            kind, detail = 'unverified', 'Public posting email; confirm that this person handles applications before sharing a resume.'
        if email.lower() not in {x['email'].lower() for x in result}:
            result.append({'email': email, 'kind': kind, 'detail': detail})
    return result


def review_score(job):
    score = 20 if job.get('pipeline') == 'contract' else 0
    score += 20 if job.get('geography') == 'US' else 0
    score += 30 if str(job.get('fit_tier', '')).startswith('1 -') else 0
    score += min(25, len(re.findall(r'python|golang|typescript|react|aws|gcp|kubernetes|agent|platform|data|backend|full.stack', job['title'], re.I))*7)
    score += 8 if job.get('official_employer_url') else 0
    qualification = job.get('qualification')
    if qualification:
        score += {'priority': 70, 'needs_confirmation': 40, 'secondary': -45, 'not_a_fit': -100}[qualification['verdict']]
    return score


def export(state_path, summary_path, qualifications_path, output, config_path=None):
    summary = json.loads(Path(summary_path).read_text(encoding='utf-8'))
    config = json.loads(Path(config_path or ROOT/'config.json').read_text(encoding='utf-8'))
    summary['source_coverage'] = coverage_for_config(summary.get('source_coverage', []), config)
    qualifications = json.loads(Path(qualifications_path).read_text(encoding='utf-8')) if Path(qualifications_path).exists() else []
    connection = sqlite3.connect(state_path)
    try:
        jobs = [json.loads(row[0]) for row in connection.execute('SELECT data FROM jobs')]
    finally:
        connection.close()
    leads = []
    for job in jobs:
        if not job.get('pipeline'):
            continue  # The seed identifies a previously reported job, not a current collected lead.
        lead = {k: v for k, v in job.items() if not k.startswith('_') and k != 'public_recruiter_contact'}
        lead['id'] = lead_id(job)
        lead['contacts'] = classify_contacts(job)
        # A review belongs to this exact posting, not future jobs sharing a title or employer.
        match = next((q for q in qualifications if q['match'].get('source_url') and
                      posting_key(q['match']['source_url']) == posting_key(job['source_url'])), None)
        if match:
            lead['qualification'] = {k: v for k, v in match.items() if k != 'match'}
        lead['review_score'] = review_score(lead)
        leads.append(lead)
    leads.sort(key=lambda lead: (-lead['review_score'], lead['title']))
    payload = {'generated_at': datetime.now(timezone.utc).isoformat(), 'collected_at': summary['created_at'],
               'summary': summary, 'leads': leads}
    path = Path(output)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(f'Exported {len(leads)} leads; {sum(bool(j.get("qualification")) for j in leads)} reviewed; no new scrapes started.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--state', default=str(ROOT/'durable-state/seen.sqlite3'))
    parser.add_argument('--summary', default=str(ROOT/'durable-state/latest/summary.json'))
    parser.add_argument('--qualifications', default=str(ROOT/'qualifications.json'))
    parser.add_argument('--output', default=str(ROOT/'web/.local/leads.json'))
    args = parser.parse_args()
    export(args.state, args.summary, args.qualifications, args.output)
