"""Conservative posting-based location evidence; never assesses a person's authorization."""
import re
from datetime import datetime, timezone

US = r'(?:United States|USA|U\.S\.|US[- ](?:based|only|remote)|remote[- ]US)'
RESTRICTION = r'must (?:reside|live|be based|be located)|(?:only|except|excluding|eligible|residents).{0,60}(?:states?|California|Texas|New York)|time.?zone|\b(?:EST|CST|PST|ET|CT|PT)\b|travel|on.?site|citizen|work authori|sponsor|clearance'

def assess(location='', description='', setting='', url='', title=''):
    text = ' '.join([title, location, setting, description])
    text = re.sub(r'\bhybrid (?:connectivity|cloud|networks?|infrastructure|environments?|identity|architectures?|solutions?|deployment)\b','',text,flags=re.I)
    clauses = [x.strip() for x in re.split(r'(?<=[.;])\s+|\n+', description) if x.strip()]
    restrictions = [s[:500] for s in clauses if re.search(RESTRICTION,s,re.I)][:12]
    remote = bool(re.search(r'\bremote\b|work from (?:home|anywhere)', text,re.I))
    not_remote = bool(re.search(r'\bhybrid\b|not remote|on.?site (?:only|required)|\d+ days?.{0,25}(?:office|on.?site)',text,re.I))
    us = bool(re.search(US, location+' '+setting+' '+title,re.I))
    evidence = [location] if us else []
    for s in clauses:
        if re.search(r'(?:remote|work from|reside|live|based|located|eligible|applicants|candidates)',s,re.I) and re.search(US,s,re.I):
            us=True; evidence.append(s[:500])
    world_clauses=[s for s in [location]+clauses if re.search(r'worldwide|work from anywhere|remote anywhere|globally remote',s,re.I)]
    excluded = bool(re.search(r'(?:outside|excluding|except|not (?:available|open) (?:in|to)).{0,30}(?:United States|USA|\bUS\b)|(?:UK|Canada|India|Europe|EU|Australia)[ -]only',text,re.I))
    status='unclear'
    if not_remote:
        status='unclear' if remote and re.search(r'(?:fully|100%) remote',text,re.I) else 'not_remote'
    elif remote:
        if excluded: status='unclear' if us else 'us_excluded'
        elif us: status='us_remote_restricted' if restrictions else 'us_remote_advertised'
        elif world_clauses: status='worldwide_remote_advertised'; evidence+=world_clauses[:2]
    if not evidence: evidence=[location or 'Permitted work location not specified.']
    return {'status':status,'restrictions':restrictions,'evidence':evidence[:4], 'source_url':url,
            'assessed_at':datetime.now(timezone.utc).isoformat()}

def reassess(job):
    if not job.get('pipeline') or job.get('pipeline')=='published_project_need': return job
    a=assess(job.get('remote_location',''),job.get('_description',''),job.get('work_arrangement',''),job.get('source_url',''),job.get('title',''))
    job['location_assessment']=a
    job['geography']='US' if a['status'].startswith('us_remote') else 'worldwide' if a['status']=='worldwide_remote_advertised' else 'unconfirmed / non-US'
    if a['status'] in ('us_excluded','not_remote') and job.get('pipeline')=='contract':
        job['pipeline']='secondary';job['fit_tier']='5 - location excludes US remote'
    if job.get('fit_tier','').startswith('1 -') and a['status']=='unclear': job['fit_tier']='2 - remote contract; location to verify'
    return job
