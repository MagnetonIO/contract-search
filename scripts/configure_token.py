#!/usr/bin/env python3
"""macOS/Linux/Windows: python scripts/configure_token.py [--provider apify|sam] [--local-only]."""
import argparse
import getpass
from pathlib import Path
import subprocess
import sys
import warnings
from datetime import datetime, timezone
from urllib.parse import urlencode

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from credentials import CredentialError, save_token, save_secret
from runner import API, SourceError, fetch


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--provider', choices=['apify', 'sam'], default='apify', help='Choose which collector credential to configure')
    parser.add_argument('--local-only', action='store_true', help='Save to the native OS vault without updating GitHub')
    parser.add_argument('--repo', default='MagnetonIO/contract-search', help='Private GitHub repository for the Actions secret')
    args = parser.parse_args(argv)
    sam = args.provider == 'sam'
    label = 'SAM.gov API key' if sam else 'Apify token'
    account = 'SAM_API_KEY' if sam else 'APIFY_TOKEN'
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error', getpass.GetPassWarning)
            token = getpass.getpass(label+' (hidden): ').strip()
    except (getpass.GetPassWarning, EOFError):
        sys.exit('Hidden token entry requires an interactive terminal.')
    if not token:
        sys.exit('No token entered.')
    try:
        if sam:
            today = datetime.now(timezone.utc).strftime('%m/%d/%Y')
            query = urlencode({'api_key':token,'postedFrom':today,'postedTo':today,'ptype':'o','limit':1,'offset':0})
            data = fetch('https://api.sam.gov/opportunities/v2/search?'+query, attempts=1)
            if not isinstance(data, dict) or not isinstance(data.get('opportunitiesData'), list):
                raise SourceError('Unexpected API response')
        else:
            fetch(API+'/users/me', token=token)
    except SourceError as error:
        detail = str(error) if str(error).startswith('HTTP ') and str(error)[5:].isdigit() else 'API authentication or response validation failed'
        sys.exit(label+' validation failed ('+detail+'); nothing was saved.')
    try:
        if sam:
            save_secret(account, token)
        else:
            save_token(token)
    except CredentialError as exc:
        sys.exit(str(exc))
    print('Token validated and saved to the native OS credential store.')
    if args.local_only:
        return
    try:
        result = subprocess.run(['gh', 'secret', 'set', account, '--repo', args.repo],
                                input=token, text=True, capture_output=True)
    except OSError:
        print('Local setup complete. Install and authenticate GitHub CLI to sync the Actions secret.')
        return
    print('GitHub Actions secret installed.' if result.returncode == 0 else
          'Local setup complete. GitHub secret sync failed; check gh authentication and repository access.')


if __name__ == '__main__':
    main()
