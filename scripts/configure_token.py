#!/usr/bin/env python3
"""Secure local token entry: python3 scripts/configure_token.py."""
import getpass
import json
import subprocess
import sys
import urllib.request


def main():
    token = getpass.getpass('Apify token (hidden): ').strip()
    if not token:
        sys.exit('No token entered.')
    request = urllib.request.Request('https://api.apify.com/v2/users/me',
                                     headers={'Authorization': 'Bearer ' + token})
    try:
        with urllib.request.urlopen(request, timeout=25) as response:
            json.load(response)
    except Exception:
        sys.exit('Apify authentication failed; nothing was saved.')
    subprocess.run(['security', 'add-generic-password', '-U', '-a', getpass.getuser(),
                    '-s', 'APIFY_TOKEN', '-w', token], check=True, capture_output=True)
    result = subprocess.run(['gh', 'secret', 'set', 'APIFY_TOKEN', '--repo',
                             'MagnetonIO/contract-search'], input=token, text=True,
                            capture_output=True)
    print('Token validated and saved to Keychain.' +
          (' GitHub Actions secret installed.' if result.returncode == 0 else
           ' GitHub secret will need syncing once the repository exists.'))


if __name__ == '__main__':
    main()
