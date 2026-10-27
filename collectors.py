"""Provider adapters and durable, conservative paid-run reservations."""
from copy import deepcopy
import sqlite3
import uuid
import threading

_RESERVATION_LOCK = threading.Lock()


class SourceError(Exception):
    pass


class Budget:
    def __init__(self, path, cap, day, persist=None):
        self.path, self.cap, self.day = str(path), cap, day
        self.persist = persist
        with sqlite3.connect(self.path) as db:
            db.execute('CREATE TABLE IF NOT EXISTS budget (id TEXT PRIMARY KEY, day TEXT, source TEXT, reserved REAL)')

    def reserve(self, amount, source):
        with _RESERVATION_LOCK:
            return self._reserve(amount, source)

    def _reserve(self, amount, source):
        with sqlite3.connect(self.path, timeout=30) as db:
            db.execute('BEGIN IMMEDIATE')
            spent = db.execute('SELECT COALESCE(SUM(reserved),0) FROM budget WHERE day=?', (self.day,)).fetchone()[0]
            if amount <= 0 or spent + amount > self.cap + 1e-9:
                raise SourceError('Chicago-day paid-run allowance exhausted; no actor started')
            key = uuid.uuid4().hex
            db.execute('INSERT INTO budget VALUES (?,?,?,?)', (key,self.day,source,amount))
        if self.persist:
            self.persist()
        return key

    def settle(self, key, final_charge):
        # Only for reconciled final billing, never provisional usage snapshots.
        with sqlite3.connect(self.path) as db:
            db.execute('UPDATE budget SET reserved=? WHERE id=?', (final_charge,key))


def variants(spec, smoke=False):
    inputs = [spec.get('smoke_input', spec.get('input'))] if smoke else spec.get('inputs', [spec.get('input')])
    result=[]
    for body in inputs:
        item=deepcopy(spec)
        item['input']=deepcopy(body)
        item['cap_usd']=(.15 if smoke else spec['cap_usd']) / len(inputs)
        # Round DOWN so fan-out never exceeds its shared cap.
        item['cap_usd']=int(item['cap_usd']*1_000_000)/1_000_000
        item['max_items']=spec.get('smoke_max_items',3) if smoke else spec['max_items']//len(inputs)
        result.append(item)
    return result


def coverage_for_config(previous, config):
    old={row['source']:row for row in previous}
    specs=config.get('actors',[])+config.get('feeds',[])
    result=[]
    for spec in specs:
        row=old.get(spec['name'])
        if row is None or row.get('status') in ('not configured','not validated'):
            validation=spec.get('validation',{})
            row={'source':spec['name'], 'status':validation.get('status','not validated'),
                 'raw':validation.get('raw',0), 'detail':validation.get('detail','Configured; awaiting a validated collection')}
            if validation.get('run_id'):
                row['detail'] += '; validation run '+validation['run_id']+' at '+str(validation.get('checked_at'))
        result.append(row)
    return result



def adapt(row, kind):
    if not isinstance(row,dict) or not kind:
        return row
    r=deepcopy(row)
    def first(*names):
        return next((r[n] for n in names if r.get(n) not in (None,'',[],{})), '')
    r['title']=first('title','jobTitle','job_title','position')
    r['companyName']=first('companyName','company','employer','company_name','organization_name')
    if isinstance(r['companyName'],dict):
        r['companyName']=r['companyName'].get('name','')
    r['jobUrl']=first('jobUrl','jobURL','url','link','job_url','listingUrl')
    r['applyUrl']=first('applyUrl','applicationUrl','apply_url','externalApplyUrl','application_url')
    r['description']=first('description','jobDescription','descriptionText','descriptionHtml','description_text','description_html')
    location=first('location','locations','jobLocation','locationName','locations_derived')
    if isinstance(location,dict):
        location=', '.join(str(location[k]) for k in ('city','state','country','name') if location.get(k))
    elif isinstance(location,list):
        location=', '.join(x if isinstance(x,str) else ', '.join(str(v) for v in x.values() if isinstance(v,str)) for x in location)
    country=r.get('country','')
    if country in ('US','USA'): country='United States'
    r['location']=str(location)+' '+country
    if r.get('isRemote') is True or r.get('remote') is True: r['workplaceType']='remote'
    r['jobType']=first('jobType','employmentType','employment_type','job_type','employmentTypes','ai_employment_type')
    salary=first('salary','salaryText','salaryInfo','compensation','salary_raw','pay')
    estimate = kind=='glassdoor'  # Do not promote board estimates into verified advertised pay.
    if isinstance(salary,dict):
        estimate = (kind=='glassdoor' and salary.get('source') != 'EMPLOYER_PROVIDED') or bool(salary.get('isEstimate') or salary.get('isEstimated'))
        low=salary.get('min',salary.get('minimum',salary.get('minSalary','')))
        high=salary.get('max',salary.get('maximum',''))
        currency=salary.get('currency','')
        period=salary.get('period',salary.get('unit',salary.get('salaryType','')))
        period={'HOURLY':'hour','ANNUAL':'year','YEARLY':'year','MONTHLY':'month'}.get(str(period).upper(),period)
        salary=f'{currency} {low}' + (f' - {high}' if high else '') + f' per {period}'
    if not salary and r.get('salaryMin') is not None:
        salary=f"{r.get('salaryCurrency','')} {r['salaryMin']} - {r.get('salaryMax','')} per {r.get('salaryPeriod','')}"
    if salary:
        r['salaryInfo']=('Provider estimate / unverified: ' if estimate else '')+str(salary)
        r['_salary_estimate']=estimate
    r['postedDate']=first('postedDate','datePosted','postedAt','posted_at','publicationDate','date_posted')
    return r
