#!/usr/bin/env python3
"""Start the local dashboard with secrets loaded into process memory from the native vault."""
import argparse
import os
from pathlib import Path
import shlex
import shutil
import subprocess
import sys

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from credentials import load_secret


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--hosted-data',action='store_true',help='Use the existing private hosted workspace instead of local data')
    args=parser.parse_args()
    environment=os.environ.copy()
    wanted={'BROWSERBASE_API_KEY','BROWSERBASE_PROJECT_ID','VERCEL_OIDC_TOKEN'}
    if args.hosted_data:
        wanted.add('BLOB_READ_WRITE_TOKEN')
        environment['DASHBOARD_STORAGE']='blob'
    # The provider integration creates this private env file. Never execute it as shell code.
    try:
        for line in (ROOT/'.env.local').read_text().splitlines():
            key,sep,value=line.partition('=')
            if sep and key in wanted and not environment.get(key):
                parts=shlex.split(value,comments=True)
                if parts and parts[0]!='[SENSITIVE]':environment[key]=parts[0]
    except FileNotFoundError:
        pass
    for key in ['AI_GATEWAY_API_KEY','BROWSERBASE_API_KEY','BROWSERBASE_PROJECT_ID']:
        secret=load_secret(key)
        if secret:environment[key]=secret
    npm=shutil.which('npm')
    if not npm:sys.exit('Install Node.js 24 and npm before starting the dashboard.')
    print('Starting the dashboard at http://127.0.0.1:3100. Secrets are passed in memory, never printed.')
    try:
        return subprocess.call([npm,'run','dev'],cwd=ROOT/'web',env=environment)
    except KeyboardInterrupt:
        return 0


if __name__=='__main__':
    sys.exit(main())
