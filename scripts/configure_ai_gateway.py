#!/usr/bin/env python3
"""Validate an AI Gateway key, save it in the native OS vault, and install a Vercel secret."""
import argparse
import getpass
import json
from pathlib import Path
import shutil
import subprocess
import sys
import warnings
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from credentials import CredentialError, save_secret

ACCOUNT = 'AI_GATEWAY_API_KEY'


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--local-only', action='store_true', help='Save only to the native OS credential store')
    args = parser.parse_args(argv)
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error', getpass.GetPassWarning)
            key = getpass.getpass('AI Gateway API key (hidden): ').strip()
    except (EOFError, getpass.GetPassWarning):
        sys.exit('Use an interactive Terminal for hidden entry.')
    if len(key) < 16 or any(c.isspace() for c in key):
        sys.exit('Invalid key format; nothing saved.')
    request = Request('https://ai-gateway.vercel.sh/v1/credits', headers={
        'Authorization': 'Bearer '+key, 'Accept': 'application/json', 'User-Agent': 'ContractDesk/1.0'})
    try:
        with urlopen(request, timeout=20) as response:
            data = json.load(response)
            if not isinstance(data, dict):
                sys.exit('Unexpected authentication response; nothing saved.')
    except HTTPError as error:
        sys.exit(f'AI Gateway validation returned HTTP {error.code}; nothing saved. Check the key and team access.')
    except (URLError, ValueError, TimeoutError):
        sys.exit('AI Gateway could not be reached or validated; nothing saved.')
    try:
        save_secret(ACCOUNT, key)
    except CredentialError as error:
        sys.exit(str(error))
    print('Key validated and saved in the native OS vault.')
    print('Vault service: contract-search; account: AI_GATEWAY_API_KEY. No plaintext key file was written.')
    if args.local_only:
        return
    npx = shutil.which('npx')
    if not npx:
        sys.exit('Local key saved. Install Node.js to configure the Vercel production secret.')
    command = [npx, '--yes', 'vercel@65.7.0', 'env', 'add', ACCOUNT,
               '--environment', 'production', '--project', 'contract-search',
               '--scope', 'magnetonios-projects', '--sensitive', '--force', '--yes']
    try:
        result = subprocess.run(command, input=key, text=True, capture_output=True, cwd=ROOT)
    except OSError:
        sys.exit('Local key saved. Vercel CLI could not run; check your Node.js installation.')
    if result.returncode:
        sys.exit('Local key saved. Vercel secret installation failed; check Vercel CLI login.')
    print('Vercel production secret installed. Redeploy production to load it.')


if __name__ == '__main__':
    main()
