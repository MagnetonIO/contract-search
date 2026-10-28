import json
from pathlib import Path
import tempfile
import unittest
from datetime import datetime, timezone
from collectors import adapt, Budget, variants, coverage_for_config
from runner import normalize, SourceError


class CollectorTests(unittest.TestCase):
    def test_builtin_salary_period_and_link(self):
        row = adapt({'title':'Python Engineer', 'jobUrl':'https://builtin.com/job/123',
                     'applyUrl':'https://example.com/jobs/123', 'company':'Example',
                     'country':'USA', 'isRemote':True, 'salaryMin':150000,
                     'salaryMax':190000, 'salaryCurrency':'USD', 'salaryPeriod':'year',
                     'description':'Contract role, C2C accepted'}, 'builtin')
        job = normalize(row, 'Built In', datetime.now(timezone.utc))
        self.assertEqual(job['hourly_min_usd'], '')
        self.assertEqual(job['application_url'], 'https://example.com/jobs/123')
        self.assertEqual(job['geography'], 'US')

    def test_estimate_never_confirms_rate(self):
        row = adapt({'jobTitle':'Python Engineer', 'jobUrl':'https://glassdoor.com/job/123',
                     'salary':{'min':150,'max':180,'currency':'USD','period':'hour','isEstimate':True},
                     'description':'Contract role. Remote. United States. C2C accepted'}, 'glassdoor')
        job = normalize(row, 'Glassdoor', datetime.now(timezone.utc))
        self.assertEqual(job['hourly_min_usd'], '')
        self.assertIn('estimate',job['pay'].lower())

    def test_nested_wellfound_and_ziprecruiter(self):
        for kind in ('wellfound','ziprecruiter'):
            row = adapt({'title':'Python Engineer', 'url':'https://example.com/job/1',
                         'company':{'name':'Example'}, 'location':{'city':'Chicago','country':'United States'},
                         'employmentType':'contract', 'description':'Remote, C2C accepted',
                         'salary':{'min':120,'max':140,'currency':'USD','period':'hour'}},kind)
            job = normalize(row,kind,datetime.now(timezone.utc))
            self.assertEqual(job['company_agency'],'Example')
            self.assertEqual(job['hourly_min_usd'],120)

    def test_shared_variant_caps(self):
        spec={'name':'Glassdoor','cap_usd':.1,'max_items':120,'inputs':[{'keywords':s} for s in ('software','DevOps','data')], 'smoke_input':{'keywords':'software','limit':3}}
        daily=variants(spec,False)
        self.assertLessEqual(sum(x['cap_usd'] for x in daily),.1)
        self.assertEqual(sum(x['max_items'] for x in daily),120)
        smoke=variants(spec,True)
        self.assertEqual(len(smoke),1)
        self.assertNotIn('urls',smoke[0]['input'])

    def test_budget_survives_restart_and_keeps_unknown_charges(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'budget.sqlite3'
            budget=Budget(path,4,'2026-10-27')
            first=budget.reserve(3.6,'daily')
            with self.assertRaises(SourceError): budget.reserve(.75,'smoke')
            budget.settle(first,2)
            Budget(path,4,'2026-10-27').reserve(.75,'smoke')
            with self.assertRaises(SourceError): Budget(path,4,'2026-10-27').reserve(2,'force')

    def test_coverage_removes_retired_without_faking_collection(self):
        old=[{'source':'UK Find a Tender','status':'disabled','raw':0}, {'source':'LinkedIn','status':'ok','raw':20}]
        config={'actors':[{'name':'LinkedIn'},{'name':'Built In'}],'feeds':[]}
        result=coverage_for_config(old,config)
        self.assertEqual([c['source'] for c in result],['LinkedIn','Built In'])
        self.assertEqual(result[0]['raw'],20)
        self.assertEqual(result[1]['status'],'not run')

    def test_config_allocations(self):
        config=json.loads(Path('config.json').read_text(encoding='utf-8'))
        self.assertEqual(config['daily_cap_usd'],6)
        self.assertLessEqual(sum(s['cap_usd'] for s in config['actors']),6)
        self.assertFalse(any(s['name']=='UK Find a Tender' for s in config['feeds']))

    def test_budget_concurrent_reservations_cannot_overspend(self):
        from concurrent.futures import ThreadPoolExecutor
        with tempfile.TemporaryDirectory() as tmp:
            budget=Budget(Path(tmp)/'budget.sqlite3',1,'2026-10-27')
            def reserve(_):
                try: budget.reserve(.3,'test'); return True
                except SourceError: return False
            with ThreadPoolExecutor(max_workers=8) as pool:
                self.assertEqual(sum(pool.map(reserve,range(8))),3)

    def test_failed_budget_persistence_never_launches_actor(self):
        from unittest.mock import patch, Mock
        from runner import collect_actor
        spec={'name':'Test','actor':'example~jobs','cap_usd':.1,'max_items':3,'input':{}}
        with patch('runner.fetch') as fetch:
            fetch.side_effect=[{'data':{'pricingInfos':[{'startedAt':'2020','pricingModel':'PAY_PER_EVENT'}]}}, {'data':{'actorDefinition':{'input':{'properties':{}}},'buildNumber':'1'}}]
            budget=Mock(); budget.reserve.side_effect=SourceError('Cannot persist')
            with self.assertRaises(SourceError): collect_actor(spec,'fake-token',budget=budget)
            self.assertEqual(fetch.call_count,2)

    def test_smoke_inputs_are_provider_specific(self):
        config=json.loads(Path('config.json').read_text(encoding='utf-8'))
        for spec in config['actors'][1:]:
            self.assertNotIn('limitPerSource', variants(spec,True)[0]['input'])
        self.assertEqual(variants(next(s for s in config['actors'] if s['name']=='Employer ATS discovery'),True)[0]['max_items'],10)

    def test_glassdoor_employer_pay_and_estimate_are_separate(self):
        row={'title':'Python Engineer','url':'https://glassdoor.com/job-listing/j?jl=123','employer':{'name':'Example'},'description':'Remote United States contract role C2C accepted','pay':{'source':'EMPLOYER_PROVIDED','currency':'USD','period':'HOURLY','min':120,'max':150}}
        job=normalize(adapt(row,'glassdoor'),'Glassdoor',datetime.now(timezone.utc))
        self.assertEqual(job['hourly_min_usd'],120)
        row['pay']['source']='ESTIMATED'
        self.assertEqual(normalize(adapt(row,'glassdoor'),'Glassdoor',datetime.now(timezone.utc))['hourly_min_usd'],'')

    def test_budget_closes_connections_after_commit(self):
        from unittest.mock import patch, MagicMock
        connection=MagicMock()
        connection.execute.return_value.fetchone.return_value=[0]
        with patch('collectors.sqlite3.connect',return_value=connection):
            budget=Budget('unused.sqlite3',4,'2026-10-27')
            budget.reserve(.15,'test')
        self.assertEqual(connection.close.call_count,2)

    def test_rate_limited_feed_keeps_actionable_status(self):
        from unittest.mock import patch
        from runner import main
        import contextlib
        import io
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            config={'actors':[],'feeds':[{'name':'SAM','kind':'sam'}],'daily_cap_usd':4,'target':50,'max_age_days':7}
            (root/'config.json').write_text(json.dumps(config),encoding='utf-8')
            with patch('runner.collect_feed',side_effect=SourceError('HTTP 429')), patch('runner.token_from_local',return_value=''), contextlib.redirect_stdout(io.StringIO()):
                code=main(['--mode','public','--config',str(root/'config.json'),'--state',str(root/'seen.sqlite3'),'--output',str(root/'out')])
            self.assertEqual(code,2)
            self.assertEqual(json.loads((root/'out/summary.json').read_text(encoding='utf-8'))['source_coverage'][0]['detail'],'HTTP 429')

    def test_staffing_structured_salary_and_derived_geography(self):
        row={'title':'Python Engineer','url':'https://careers.teksystems.com/job/1','organization':'TEKsystems','locations':[{'address':{'addressCountry':'USA'}}], 'locations_derived':['Chicago, Illinois, United States'], 'salary':{'currency':'USD','value':{'minValue':120,'maxValue':140,'unitText':'hour'}},'employment_type':['CONTRACTOR'],'ai_work_arrangement':'Remote','description_text':'Contract role; C2C accepted.'}
        job=normalize(adapt(row,'staffing'),'Staffing firm career feeds',datetime.now(timezone.utc))
        self.assertEqual(job['hourly_min_usd'],120)
        self.assertEqual(job['geography'],'US')
        self.assertEqual(job['direct_client_classification'],'agency / client unverified')
