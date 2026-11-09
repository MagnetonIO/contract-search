import unittest
from datetime import datetime, timezone
from public_jobs import collect_public
from runner import normalize, collection_age_days

NOW = datetime(2026,11,9,tzinfo=timezone.utc)

class PublicJobsTests(unittest.TestCase):
    def test_himalayas_preserves_apply_link_dates_and_restrictions(self):
        data={'jobs':[{'guid':'https://himalayas.app/companies/example/jobs/fde','title':'Forward Deployed Engineer','companyName':'Example','employmentType':'Contractor','locationRestrictions':['United States'],'timezoneRestrictions':[-6,-5],'description':'Remote US contract software role','pubDate':int(NOW.timestamp())-86400*20,'expiryDate':int(NOW.timestamp())+86400,'applicationLink':'https://himalayas.app/companies/example/jobs/fde?utm_source=api'}]}
        spec={'kind':'himalayas','name':'Himalayas','queries':['engineer'],'max_pages':1,'max_age_days':60}
        rows=collect_public(spec,lambda *a,**kw:data,now=NOW)
        job=normalize(rows[0],spec['name'],NOW)
        self.assertTrue(job['application_url'].endswith('?utm_source=api'))
        self.assertEqual(job['pipeline'],'contract')
        self.assertEqual(collection_age_days(job,7),60)
        self.assertLess(job['source_posted_at'],NOW.isoformat())
        data['jobs'][0]['expiryDate']=int(NOW.timestamp())-1
        self.assertEqual(collect_public(spec,lambda *a,**kw:data,now=NOW),[])
        data['jobs'][0]['expiryDate']=int(NOW.timestamp())+86400
        data['jobs'][0]['timezoneRestrictions']=[9]
        self.assertEqual(collect_public(spec,lambda *a,**kw:data,now=NOW),[])

    def test_ashby_only_listed_contracts_and_real_salary_units(self):
        row={'id':'a','title':'Senior DevSecOps Engineer (Contract)','isListed':True,'employmentType':'Contract','workplaceType':'Remote','location':'United States','publishedAt':'2026-10-27T00:00:00Z','descriptionPlain':'Remote US contract. C2C accepted.','jobUrl':'https://jobs.ashbyhq.com/example/a','applyUrl':'https://jobs.ashbyhq.com/example/a/application','compensation':{'summaryComponents':[{'compensationType':'Salary','interval':'1 HOUR','currencyCode':'USD','minValue':90,'maxValue':120}]}}
        spec={'kind':'ashby','name':'Direct employer boards','boards':[{'slug':'example','company':'Example'}],'max_age_days':60}
        data={'jobs':[row,{**row,'id':'hidden','isListed':False},{**row,'id':'perm','employmentType':'FullTime'}]}
        rows=collect_public(spec,lambda *a,**kw:data,now=NOW);self.assertEqual(len(rows),1)
        job=normalize(rows[0],spec['name'],NOW);self.assertEqual(job['hourly_min_usd'],90);self.assertEqual(job['pipeline'],'contract');self.assertIn('$90 - $120/hr',job['pay'])
        self.assertEqual(collection_age_days(job,7),60)
        self.assertEqual(collection_age_days({'source_active_at':NOW.isoformat()},7),7)

    def test_jobicy_attribution_and_bounded_pagination(self):
        calls=[]
        def fetch(url,**kw):
            calls.append(url)
            return {'jobs':[{'id':str(len(calls)),'url':'https://jobicy.com/jobs/'+str(len(calls)),'jobTitle':'Python Engineer','companyName':'Example','jobType':['Contract'],'jobGeo':'USA','pubDate':'2026-11-08T00:00:00Z','jobDescription':'Remote US contract software role'}],'nextCursor':'next'}
        rows=collect_public({'kind':'jobicy','name':'Jobicy','max_pages':2},fetch,now=NOW)
        self.assertEqual(len(calls),2);self.assertEqual(len(rows),2)
        job=normalize(rows[0],'Jobicy',NOW);self.assertEqual(job['source_url'],job['application_url']);self.assertEqual(job['pipeline'],'contract')

    def test_partial_board_failure_keeps_collected_rows_and_marks_partial(self):
        spec={'kind':'ashby','boards':[{'slug':'first','company':'First'},{'slug':'second','company':'Second'}]}
        def fetch(url,**kw):
            if '/second?' in url:raise ValueError('upstream unavailable')
            return {'jobs':[{'title':'Data Engineer','isListed':True,'employmentType':'Contract','jobUrl':'https://jobs.ashbyhq.com/first/a','applyUrl':'https://jobs.ashbyhq.com/first/a/application','descriptionPlain':'Remote US contract'}]}
        rows=collect_public(spec,fetch,now=NOW);self.assertEqual(len(rows),1);self.assertEqual(len(spec['_source_warnings']),1)
