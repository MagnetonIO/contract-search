#!/usr/bin/env python3
"""Enter a Resend key privately, test a self-email, and configure local/GitHub/Vercel sending."""
import argparse
import getpass
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
import uuid
import warnings

ROOT = Path(__file__).resolve().parents[1]
PROJECT = 'prj_vqOshmC6BaVQoSsI5G87NLdAOrcK'
TEAM = 'magnetonios-projects'


def run(command, secret=None):
    try:
        result = subprocess.run(command, input=secret, text=True, capture_output=True, cwd=ROOT)
        return result.returncode == 0
    except OSError:
        return False


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--local-only', action='store_true', help='Skip GitHub and Vercel configuration')
    args = parser.parse_args()
    print('Sender and recipient: mlong@magneton.io. This sends one setup email to yourself.')
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error', getpass.GetPassWarning)
            key = getpass.getpass('Resend API key (hidden): ').strip()
    except (EOFError, getpass.GetPassWarning):
        sys.exit('Use an interactive Terminal for hidden entry.')
    if not key.startswith('re_') or any(c.isspace() for c in key):
        sys.exit('Invalid key format; nothing saved.')
    payload = {'from': 'Matthew Long <mlong@magneton.io>', 'to': ['mlong@magneton.io'],
               'reply_to': 'mlong@magneton.io', 'subject': 'Contract Desk email connection',
               'text': 'Resend is connected for Contract Desk. Daily contract digests will come here. Recruiter messages are sent only after approval in your dashboard.'}
    request = Request('https://api.resend.com/emails', data=json.dumps(payload).encode(),
                      headers={'Authorization': 'Bearer '+key, 'Content-Type': 'application/json',
                               'User-Agent': 'ContractDesk/1.0', 'Accept': 'application/json',
                               'Idempotency-Key': 'contract-desk-setup/'+str(uuid.uuid4())}, method='POST')
    try:
        with urlopen(request, timeout=30) as response:
            if not json.load(response).get('id'):
                sys.exit('No email receipt returned; nothing saved.')
    except HTTPError as error:
        detail = 'No safe error detail was returned.'
        try:
            body = error.read(10000).decode('utf-8', 'replace')
            parsed = json.loads(body)
            message = str(parsed.get('message') or parsed.get('name') or '')
            detail = message.replace(key, '[REDACTED]').replace('\n', ' ').replace('\r', ' ')[:500]
        except (ValueError, OSError):
            if '1010' in locals().get('body', ''):
                detail = 'The API gateway blocked the client request (1010).'
        sys.exit(f'Resend HTTP {error.code}: {detail} Nothing saved.')
    except (URLError, TimeoutError, ValueError):
        sys.exit('Could not confirm the setup email; nothing saved. Check Resend before retrying.')
    directory = ROOT/'web'/'.local'
    directory.mkdir(parents=True, exist_ok=True)
    temporary = directory/('mail.'+str(uuid.uuid4())+'.tmp')
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, 'w', encoding='utf-8') as file:
        json.dump({'apiKey': key}, file)
    os.replace(temporary, directory/'mail.json')
    print('Setup email accepted by Resend. Local configuration saved privately.')
    if args.local_only:
        return
    github = run(['gh', 'secret', 'set', 'RESEND_API_KEY', '--repo', 'MagnetonIO/contract-search'], key)
    print('GitHub Actions: '+('configured.' if github else 'not configured; check GitHub CLI login.'))
    npx = shutil.which('npx')
    if not npx:
        sys.exit('Local setup saved. Install Node.js to configure Vercel.')
    cli = [npx, '--yes', 'vercel@65.1.0']
    # Verify the existing project link before updating its production secret.
    try:
        linked = json.loads((ROOT/'.vercel/project.json').read_text(encoding='utf-8'))
    except (OSError, ValueError):
        sys.exit('Local setup saved. Vercel project link is missing.')
    if linked.get('projectId') != PROJECT or linked.get('orgId') != 'team_N0SIOgAKLlD4Sa91HEiKpDPo':
        sys.exit('Local setup saved. Vercel project link does not match Contract Desk.')
    if not run(cli+['project', 'inspect', '--non-interactive', '--scope', TEAM]):
        sys.exit('Local setup saved. Could not verify the Vercel project; check Vercel CLI login.')
    hosted = run(cli+['env', 'add', 'RESEND_API_KEY', '--environment', 'production', '--project', PROJECT,
                      '--scope', TEAM, '--sensitive', '--force', '--yes'], key)
    print('Vercel production: '+('secret configured; a new deployment will load it.' if hosted else 'not configured; check Vercel CLI login.'))


if __name__ == '__main__':
    main()
