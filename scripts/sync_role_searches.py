#!/usr/bin/env python3
"""Add the tracked role families to existing collector inputs, preserving caps."""
import json
from pathlib import Path
from urllib.parse import urlencode

ROOT=Path(__file__).resolve().parents[1]

def sync(config,roles):
    queries=list(dict.fromkeys([r['aliases'][0] for r in roles]+[r['aliases'][1] for r in roles if r['id'] in ('cto','lead-software','engineering-manager')]))
    def unique(values):return list(dict.fromkeys(values))
    for actor in config['actors']:
        name=actor['name'];data=actor.get('input',{})
        if name=='LinkedIn':
            added=['https://www.linkedin.com/jobs/search/?'+urlencode({'keywords':'remote contract '+q,'location':'United States','f_TPR':'r604800'}) for q in queries]
            data['urls']=unique(added+data['urls']);data['limitPerSource']=max(1,actor['max_items']//len(data['urls']))
        elif name=='Indeed':
            added=[{'url':'https://www.indeed.com/jobs?'+urlencode({'q':q+' contract','l':'Remote','fromage':7})} for q in queries]
            data['startUrls']=[{'url':u} for u in unique([r['url'] for r in added+data['startUrls']])];data['maxItemsPerSearch']=max(1,actor['max_items']//len(data['startUrls']))
        elif name=='Dice':data['searchQueries']=unique(queries+data['searchQueries'])
        elif name=='Built In':
            data['searchQueries']=unique(queries+data['searchQueries']);data['maxResultsPerQuery']=max(1,actor['max_items']//len(data['searchQueries']))
        elif name=='JobServe US':data['keywords']=unique(queries+data['keywords'])
        elif name=='Employer ATS discovery':data['titleSearch']=unique([r['aliases'][0] for r in roles]+data['titleSearch'])
        elif name=='Staffing firm career feeds':data['titleSearch']=unique([r['aliases'][0]+':*' for r in roles]+data['titleSearch'])
    for feed in config['feeds']:
        if feed['kind']=='techfetch':feed['queries']=unique(queries+feed['queries'])
    config['tracked_roles']=[r['id'] for r in roles]
    return config

if __name__=='__main__':
    file=ROOT/'config.json';config=json.loads(file.read_text(encoding='utf-8'));roles=json.loads((ROOT/'web/lib/role-catalog.json').read_text(encoding='utf-8'))
    file.write_text(json.dumps(sync(config,roles),indent=2)+'\n',encoding='utf-8')
