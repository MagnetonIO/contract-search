"""Bounded public job feeds; original dates and application URLs stay intact."""
from datetime import datetime, timezone
from urllib.parse import urlencode, urlsplit
from collectors import SourceError

UTC = timezone.utc

def stamp(value):
    try:
        if isinstance(value,(int,float)):
            return datetime.fromtimestamp(value / (1000 if value > 1e12 else 1),UTC).isoformat()
        return datetime.fromisoformat(str(value).replace('Z','+00:00')).astimezone(UTC).isoformat()
    except (ValueError,TypeError,OverflowError):
        return ''

def money(low,high,currency,period):
    if low is None and high is None:return ''
    prefix='$' if currency=='USD' else str(currency or '')+' '
    value=str(low if low is not None else high)
    if high is not None and low is not None and high!=low:value+=' - '+prefix+str(high)
    return prefix+value+{'hourly':'/hr','1 HOUR':'/hr','annual':'/yr','1 YEAR':'/yr','monthly':'/month','1 MONTH':'/month'}.get(period,' per '+str(period or 'unknown period'))

def collect_public(spec,fetch,*,now=None):
    now=now or datetime.now(UTC)
    rows=[];seen=set();warnings=[]
    def add(row):
        key=row.get('url')
        if key and key not in seen:seen.add(key);rows.append(row)
    def request(url):
        data=fetch(url,attempts=1)
        if not isinstance(data,dict) or not isinstance(data.get('jobs'),list):raise SourceError('Public jobs feed schema changed')
        return data
    def active(row):
        row['_source_active_at']=now.isoformat()
        row['_source_max_age_days']=max(7,min(60,int(spec.get('max_age_days',7))))
        return row
    kind=spec['kind']
    if kind=='himalayas':
        for query in spec.get('queries',['engineer'])[:6]:
            for page in range(1,min(3,int(spec.get('max_pages',1)))+1):
                try:data=request('https://himalayas.app/jobs/api/search?'+urlencode({'country':'US','employment_type':'Contractor,Temporary','sort':'recent','q':query,'page':page}))
                except Exception as exc:
                    if not rows:raise
                    warnings.append('Himalayas search incomplete: '+type(exc).__name__);break
                for job in data['jobs']:
                    expiry=stamp(job.get('expiryDate'))
                    if not expiry or expiry<=now.isoformat():continue
                    zones=job.get('timezoneRestrictions',[])
                    if zones and -6 not in zones:continue
                    if job.get('employmentType') not in ('Contractor','Temporary'):continue
                    add(active({'id':job.get('guid'),'url':job.get('guid'),'applyUrl':job.get('applicationLink'),'_preserve_apply_url':True,'_source_expires_at':expiry,'title':job.get('title'),'companyName':job.get('companyName'),'jobType':job.get('employmentType'),'workplaceType':'remote','location':', '.join(job.get('locationRestrictions') or ['Worldwide']),'description':job.get('description'),'postedDate':stamp(job.get('pubDate')),'salaryInfo':money(job.get('minSalary'),job.get('maxSalary'),job.get('currency'),job.get('salaryPeriod'))}))
                if len(data['jobs'])<20:break
    elif kind=='jobicy':
        cursor=None
        for _ in range(min(3,int(spec.get('max_pages',1)))):
            params={'count':100,'geo':'usa','industry':'engineering'}
            if cursor:params['cursor']=cursor
            try:data=request('https://jobicy.com/api/jobs?'+urlencode(params))
            except Exception as exc:
                if not rows:raise
                warnings.append('Jobicy page incomplete: '+type(exc).__name__);break
            for job in data['jobs']:
                add({'id':job.get('id'),'url':job.get('url'),'applyUrl':job.get('url'),'title':job.get('jobTitle'),'companyName':job.get('companyName'),'jobType':job.get('jobType'),'workplaceType':'remote','location':job.get('jobGeo'),'description':job.get('jobDescription'),'postedDate':stamp(job.get('pubDate')),'salaryInfo':money(job.get('salaryMin'),job.get('salaryMax'),job.get('salaryCurrency'),job.get('salaryPeriod'))})
            next_cursor=data.get('nextCursor')
            if not next_cursor or next_cursor==cursor:break
            cursor=next_cursor
    elif kind=='ashby':
        for board in spec.get('boards',[])[:20]:
            slug=board['slug']
            if not slug.replace('-','').isalnum():raise SourceError('Invalid employer board slug')
            try:data=request('https://api.ashbyhq.com/posting-api/job-board/'+slug+'?includeCompensation=true')
            except Exception as exc:
                warnings.append(slug+': '+type(exc).__name__);continue
            for job in data['jobs'][:1000]:
                if job.get('isListed') is not True or job.get('employmentType') not in ('Contract','Temporary'):continue
                url=job.get('jobUrl','');parsed=urlsplit(url)
                if parsed.scheme!='https' or parsed.hostname!='jobs.ashbyhq.com' or not parsed.path.startswith('/'+slug+'/'):continue
                components=(job.get('compensation') or {}).get('summaryComponents') or []
                salary=next((c for c in components if c.get('compensationType')=='Salary' and c.get('currencyCode')=='USD'),{})
                postal=(job.get('address') or {}).get('postalAddress') or {}
                location=', '.join(dict.fromkeys(str(v) for v in [job.get('location'),postal.get('addressCountry')] if v))
                add(active({'id':url,'url':url,'applyUrl':job.get('applyUrl') or url,'_preserve_apply_url':True,'title':job.get('title'),'companyName':board['company'],'jobType':job.get('employmentType'),'workplaceType':job.get('workplaceType') or ('remote' if job.get('isRemote') else ''),'location':location,'description':job.get('descriptionPlain') or job.get('descriptionHtml'),'postedDate':stamp(job.get('publishedAt')),'salaryInfo':money(salary.get('minValue'),salary.get('maxValue'),salary.get('currencyCode'),salary.get('interval'))}))
        if warnings and not rows:raise SourceError('Employer boards unavailable: '+'; '.join(warnings))
    else:raise SourceError('Unsupported public jobs feed')
    if warnings:spec['_source_warnings']=warnings
    return rows[:min(1000,int(spec.get('max_items',300)))]
