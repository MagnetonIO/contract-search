import csv
from datetime import datetime, timezone
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import runner as r

NOW = datetime(2026, 10, 26, 13, tzinfo=timezone.utc)


def job(**overrides):
    data = dict(id='123', title='Senior Python Engineer', companyName='Example',
                link='https://www.linkedin.com/jobs/view/123?trackingId=secret',
                location='Remote United States', jobType='Contract',
                postedAt='2026-10-25T12:00:00Z',
                salaryInfo='$100-120/hr',
                description='Remote contract position. C2C accepted. Python AWS Kubernetes. Must reside in the United States.')
    data.update(overrides)
    return r.normalize(data, 'LinkedIn', NOW)


class NormalizeTests(unittest.TestCase):
    def test_primary_and_original_date(self):
        j = job()
        self.assertTrue(j['fit_tier'].startswith('1 -'))
        self.assertEqual(j['hourly_min_usd'], 100)
        self.assertEqual(j['source_posted_at'], '2026-10-25T12:00:00+00:00')
        self.assertNotEqual(j['source_posted_at'], j['first_seen'])
        self.assertIn('Must reside', j['work_abroad_restrictions'])

    def test_c2c_negation_and_w2(self):
        for desc in ('No C2C. Remote contract position. Python.',
                     'C2C not accepted. Python remote contract position.',
                     'W2 only. Python remote contract position.'):
            j = job(description=desc)
            self.assertEqual(j['c2c_status'], 'not accepted')
            self.assertEqual(j['pipeline'], 'secondary')

    def test_lower_rate_does_not_meet_target(self):
        j = job(salaryInfo='$75 per hour')
        self.assertEqual(j['pipeline'], 'secondary')
        self.assertTrue(j['fit_tier'].startswith('4 -'))

    def test_w2_listed_is_secondary_without_assuming_exclusion(self):
        j = job(description='Python remote contract position, W2 engagement.')
        self.assertEqual(j['pipeline'], 'secondary')
        self.assertEqual(j['contract_status'], 'W2 contract')
        self.assertEqual(j['c2c_status'], 'unknown')
        j = job(description='Python remote contract position, W2 or C2C accepted.')
        self.assertEqual(j['pipeline'], 'contract')

    def test_annual_and_foreign_pay_not_hourly_usd(self):
        for pay in ('$150,000/year', 'CAD $100-120/hr', '£120/hour', '$120k annually'):
            j = job(salaryInfo=pay)
            self.assertEqual(j['hourly_min_usd'], '')
            self.assertFalse(j['fit_tier'].startswith('1 -'))

    def test_relative_date_not_invented(self):
        j = job(postedAt='2 days ago')
        self.assertEqual(j['source_posted_at'], '')
        self.assertEqual(j['source_date_text'], '2 days ago')

    def test_unknown_terms_and_permanent(self):
        j = job(salaryInfo='', description='Python AWS software development. Remote contract position.')
        self.assertEqual(j['c2c_status'], 'unknown')
        self.assertEqual(j['pipeline'], 'contract')
        j = job(jobType='Full-time', description='Python engineer manages vendor contracts.')
        self.assertEqual(j['pipeline'], 'secondary')

    def test_hybrid_and_not_remote(self):
        for desc in ('Hybrid Python engineer, 2 days in office.', 'Python engineer. On-site required, not remote.'):
            self.assertEqual(job(description=desc)['pipeline'], 'secondary')

    def test_missing_or_expired_rejected(self):
        self.assertIsNone(job(title=''))
        self.assertIsNone(job(isExpired=True))

    def test_no_inferred_client(self):
        j = job(companyName='Motion Recruitment', description='Our client needs a Python contract engineer.')
        self.assertEqual(j['direct_client_classification'], 'agency / client unverified')
        self.assertEqual(j['official_employer_url'], '')

    @patch('runner.fetch')
    def test_official_evidence_survives_cross_board_duplicate(self, fetch):
        a, b = job(), job()
        a['application_url'] = b['application_url'] = 'https://boards.greenhouse.io/example/jobs/123'
        b['source'] = 'Employer ATS discovery'
        fetch.return_value = b'Example Senior Python Engineer official job posting'
        r.enrich([a, b])
        self.assertEqual(a['official_employer_url'], b['application_url'])
        self.assertIn('verified', a['direct_client_classification'])

    def test_canonical_preserves_job_identity(self):
        self.assertEqual(r.canonical('https://www.indeed.com/viewjob?jk=abc&utm_source=x'), 'https://www.indeed.com/viewjob?jk=abc')
        self.assertNotEqual(r.canonical('https://x/jobs?id=1'), r.canonical('https://x/jobs?id=2'))
        self.assertEqual(r.canonical('https://www.linkedin.com/jobs/view/senior-dev-4481766456?token=abc'), 'https://www.linkedin.com/jobs/view/4481766456')
        self.assertEqual(r.canonical('javascript:alert(1)'), '')


class DedupTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.state = r.State(Path(self.tmp.name)/'seen.sqlite3')

    def tearDown(self):
        self.state.db.close()
        self.tmp.cleanup()

    def test_survives_restart_and_keeps_first_seen(self):
        self.assertTrue(self.state.observe(job()))
        self.state.db.commit()
        self.state.db.close()
        self.state = r.State(Path(self.tmp.name)/'seen.sqlite3')
        j = job()
        j['first_seen'] = '2026-10-27T13:00:00+00:00'
        self.assertFalse(self.state.observe(j))
        self.assertEqual(j['first_seen'], NOW.isoformat())

    def test_repost_new_id_same_description(self):
        description = ' '.join('unique'+str(i) for i in range(150))+' Python engineer remote contract position'
        a = job(description=description)
        b = job(id='456', link='https://www.indeed.com/viewjob?jk=456', description=description)
        b['source'] = 'Indeed'
        self.assertTrue(self.state.observe(a))
        self.assertFalse(self.state.observe(b))

    def test_shared_title_distinct_requisitions_survive(self):
        self.assertTrue(self.state.observe(job(description='Python cloud infrastructure contract position.')))
        self.assertTrue(self.state.observe(job(id='456', link='https://x/jobs/456', description='Python data pipelines contract position.')))

    def test_already_reported_motion_job_seed(self):
        self.state.seed()
        self.assertFalse(self.state.observe(job(id='4481766456', link='https://www.linkedin.com/jobs/view/4481766456')))


class ProviderTests(unittest.TestCase):
    @patch('runner.fetch')
    def test_procurement_only_open_notices_and_notice_link(self, fetch):
        fetch.return_value = json.dumps({'releases': [
            {'ocid': 'a', 'buyer': {'name': 'Buyer'}, 'tender': {
                'title': 'Python software platform development', 'status': 'active',
                'description': 'Seeking external software engineering services.',
                'tenderPeriod': {'endDate': '2099-01-01T00:00:00Z'},
                'documents': [{'documentType': 'conflictOfInterest'},
                              {'documentType': 'tenderNotice', 'url': 'https://www.find-tender.service.gov.uk/Notice/123'}]}},
            {'ocid': 'b', 'tender': {'title': 'Python project award', 'status': 'complete'}}
        ]}).encode()
        rows = r.collect_feed({'url': 'https://example.com', 'kind': 'ocds'})
        self.assertEqual(len(rows), 2)
        j = r.normalize(rows[0], 'UK Find a Tender', NOW, True)
        self.assertEqual(j['pipeline'], 'published_project_need')
        self.assertEqual(j['source_url'], 'https://www.find-tender.service.gov.uk/Notice/123')
        self.assertEqual(j['direct_client_classification'], 'published buyer notice')
        self.assertIsNone(r.normalize(rows[1], 'UK Find a Tender', NOW, True))

    def test_schema_drift_refuses_run(self):
        with self.assertRaises(r.SourceError):
            r.validate_input({'properties': {}}, {'removedField': 1})
        with self.assertRaises(r.SourceError):
            r.validate_input({'properties': {'limit': {'type': 'integer', 'minimum': 1}}}, {'limit': 0})

    @patch('runner.time.sleep')
    @patch('runner.fetch')
    def test_charge_cap_pagination_and_no_start_retry(self, fetch, sleep):
        spec = json.loads(Path('config.json').read_text())['actors'][0]
        meta = {'data': {'pricingInfos': [{'pricingModel': 'PAY_PER_EVENT', 'startedAt': '2026-01-01'}]}}
        schema = {'properties': {k: {} for k in spec['input']}}
        build = {'data': {'actorDefinition': {'input': schema}, 'buildNumber': '0.1.1'}}
        start = {'data': {'id': 'run1', 'status': 'RUNNING'}}
        finish = {'data': {'id': 'run1', 'status': 'SUCCEEDED', 'defaultDatasetId': 'data1', 'usageTotalUsd': .01}}
        fetch.side_effect = [meta, build, start, finish, [{'title': 'one'}]*100, [{'title': 'two'}]*80]
        rows, record = r.collect_actor(spec, 'fake-token')
        self.assertEqual(len(rows), 180)
        self.assertIn('maxTotalChargeUsd=0.4', fetch.call_args_list[2].args[0])
        self.assertIn('offset=100', fetch.call_args_list[-1].args[0])
        self.assertEqual(record['actual_charge_usd'], .01)

    @patch('runner.time.sleep')
    @patch('runner.fetch')
    def test_poll_failure_aborts(self, fetch, sleep):
        spec = json.loads(Path('config.json').read_text())['actors'][0]
        fetch.side_effect = [
            {'data': {'pricingInfos': [{'pricingModel': 'PAY_PER_EVENT', 'startedAt': '2026-01-01'}]}},
            {'data': {'actorDefinition': {'input': {'properties': {k: {} for k in spec['input']}}}, 'buildNumber': '1'}},
            {'data': {'id': 'run1', 'status': 'RUNNING'}}, r.SourceError('poll unavailable'), {}]
        with self.assertRaises(r.SourceError):
            r.collect_actor(spec, 'fake-token')
        self.assertTrue(fetch.call_args_list[-1].args[0].endswith('/abort'))

    def test_empty_report_honest_shortfall(self):
        with tempfile.TemporaryDirectory() as tmp, patch('sys.stdout', new_callable=io.StringIO):
            report = r.report(Path(tmp), [], [{'source': 'X', 'status': 'failed', 'detail': 'HTTP 403'}],
                              dict(raw=0, relevant=0, new_unique=0, duplicates=0, stale=0, rejected=0),
                              [], {'target': 50}, NOW, 'daily')
            self.assertEqual(report['shortfall'], 50)
            self.assertIn('HTTP 403', Path(tmp, 'summary.md').read_text())
            self.assertEqual(len(list(csv.reader(io.StringIO(Path(tmp, 'contracts.csv').read_text())))), 1)

    def test_csv_formula_escaped(self):
        self.assertEqual(r.csv_cell('=cmd()'), "'=cmd()")
        self.assertEqual(r.csv_cell('normal'), 'normal')


if __name__ == '__main__':
    unittest.main()
