#!/usr/bin/env python3
"""macOS/Linux/Windows: python scripts/configure_token.py [--local-only]."""
import argparse
import getpass
from pathlib import Path
import subprocess
import sys
import warnings

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from credentials import CredentialError, save_token
from runner import API, SourceError, fetch


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--local-only', action='store_true', help='Save to the native OS vault without updating GitHub')
    parser.add_argument('--repo', default='MagnetonIO/contract-search', help='Private GitHub repository for the Actions secret')
    args = parser.parse_args(argv)
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error', getpass.GetPassWarning)
            token = getpass.getpass('Apify token (hidden): ').strip()
    except (getpass.GetPassWarning, EOFError):
        sys.exit('Hidden token entry requires an interactive terminal.')
    if not token:
        sys.exit('No token entered.')
    try:
        fetch(API+'/users/me', token=token)
    except SourceError:
        sys.exit('Apify authentication failed; nothing was saved.')
    try:
        save_token(token)
    except CredentialError as exc:
        sys.exit(str(exc))
    print('Token validated and saved to the native OS credential store.')
    if args.local_only:
        return
    try:
        result = subprocess.run(['gh', 'secret', 'set', 'APIFY_TOKEN', '--repo', args.repo],
                                input=token, text=True, capture_output=True)
    except OSError:
        print('Local setup complete. Install and authenticate GitHub CLI to sync the Actions secret.')
        return
    print('GitHub Actions secret installed.' if result.returncode == 0 else
          'Local setup complete. GitHub secret sync failed; check gh authentication and repository access.')


if __name__ == '__main__':
    main()
