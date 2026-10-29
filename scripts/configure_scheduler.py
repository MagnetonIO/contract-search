#!/usr/bin/env python3
"""Securely install a repository-scoped GitHub Actions token for the hosted scheduler."""
import getpass
import json
from pathlib import Path
import subprocess
import sys
import warnings
import uuid
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

def main():
    print('Create a fine-grained GitHub token: owner MagnetonIO, only contract-search, Actions read/write. No other repository permissions are needed.')
    print('https://github.com/settings/personal-access-tokens/new')
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error', getpass.GetPassWarning)
            key = getpass.getpass('Repository token (hidden): ').strip()
    except (EOFError, getpass.GetPassWarning):
        sys.exit('Use an interactive Terminal for hidden entry.')
    if not key.startswith('github_pat_') or any(c.isspace() for c in key):
        sys.exit('Use a fine-grained repository token; nothing saved.')
    req = Request('https://api.github.com/repos/MagnetonIO/contract-search/actions/workflows/contracts.yml', headers={'Authorization':'Bearer '+key,'User-Agent':'ContractDesk-Scheduler','Accept':'application/vnd.github+json'})
    try:
        with urlopen(req, timeout=20) as response:
            if json.load(response).get('path') != '.github/workflows/contracts.yml':
                sys.exit('Unexpected repository response; nothing saved.')
    except (HTTPError, URLError):
        sys.exit('Token could not read the workflow. Check repository selection, expiration, organization approval and Actions permission.')
    probe = Request(req.full_url+'/dispatches',data=json.dumps({'ref':'contractdesk-permission-check-'+uuid.uuid4().hex,'inputs':{'mode':'daily'}}).encode(),headers={**req.headers,'Content-Type':'application/json'},method='POST')
    try:
        with urlopen(probe,timeout=20):
            sys.exit('Unexpected permission probe result; nothing saved.')
    except HTTPError as error:
        if error.code != 422:
            sys.exit('Actions write permission is unavailable. Check token permissions and organization approval; nothing saved.')
    except URLError:
        sys.exit('GitHub permission check unavailable; nothing saved.')
    result = subprocess.run(['npx','--yes','vercel@65.7.0','env','add','COLLECTOR_GITHUB_TOKEN','--environment','production','--project','contract-search','--scope','magnetonios-projects','--sensitive','--force','--yes'],input=key,text=True,capture_output=True,cwd=Path(__file__).resolve().parents[1])
    if result.returncode:
        sys.exit('Secret installation failed. Check Vercel CLI login. Token was not printed or saved locally.')
    print('Secret installed securely. A production deployment is required to activate it.')

if __name__ == '__main__':
    main()
