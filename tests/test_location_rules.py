import unittest,tempfile,sqlite3
from pathlib import Path
from location_rules import assess,reassess
from collectors import Budget,SourceError
from techfetch import parse_posting

class LocationTests(unittest.TestCase):
    def test_no_timezone_or_office_country_inference(self):
        for text in ['Remote Python role. Work CST hours.','Remote engineer. Our office is in the United States.','Remote team across America.']:
            self.assertEqual(assess(description=text)['status'],'unclear')
    def test_scope_restrictions_and_conflicts(self):
        self.assertEqual(assess('Remote United States')['status'],'us_remote_advertised')
        self.assertEqual(assess('Remote USA','Must reside in one of the listed states. Work EST hours.')['status'],'us_remote_restricted')
        self.assertEqual(assess('Remote','Work from anywhere worldwide.')['status'],'worldwide_remote_advertised')
        self.assertEqual(assess('Remote','Canada only.')['status'],'us_excluded')
        self.assertEqual(assess('Remote USA','Canada only.')['status'],'unclear')
        self.assertEqual(assess('Hybrid USA')['status'],'not_remote')
    def test_backfill_preserves_identity_and_unknown_candidates(self):
        job={'pipeline':'contract','source_url':'https://example.com/a','first_seen':'yesterday','fit_tier':'1 - priority','remote_location':'Remote CST'}
        result=reassess(job);self.assertEqual(result['pipeline'],'contract');self.assertEqual(result['source_url'],job['source_url']);self.assertEqual(result['first_seen'],'yesterday');self.assertEqual(result['location_assessment']['status'],'unclear')
    def test_monthly_reservations_enforced_atomically(self):
        with tempfile.TemporaryDirectory() as tmp:
            b=Budget(Path(tmp)/'budget.sqlite3',6,'2026-10-27',cycle={'startAt':'2026-10-01T00:00:00Z'},monthly_cap=.2)
            b.reserve(.15,'a')
            with self.assertRaises(SourceError):b.reserve(.1,'b')
            self.assertAlmostEqual(b.remaining(),.05)
    def test_legacy_reservations_include_cycle_overlap(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'budget.sqlite3';b=Budget(path,6,'2026-10-27',cycle={'startAt':'2026-10-28T00:00:00Z'},monthly_cap=50)
            with sqlite3.connect(path) as db:db.execute("INSERT INTO budget (id,day,source,reserved) VALUES ('old','2026-10-27','a',4)")
            self.assertEqual(b.remaining(),46)
    def test_techfetch_posting_excludes_suggested_jobs(self):
        html='<h1>Remote Python engineer</h1><h2>Remote Work from Home</h2><h3>Example Staffing</h3><p>Today (Oct-27-26)</p><p>Consulting / Contract</p><p>Rate/Salary ($) : 120/hr corp to corp Duration : 6 months</p><p>Job Description : Python AWS. Remote contract role.</p><p>Similar Jobs</p><p>No C2C. Onsite required.</p>'
        row=parse_posting(html,'https://www.techfetch.com/job-description/python-j1234');self.assertEqual(row['postedDate'],'2026-10-27');self.assertNotIn('No C2C',row['description']);self.assertEqual(row['company'],'Example Staffing')
    def test_hybrid_technology_is_not_a_work_arrangement(self):
        self.assertEqual(assess('Remote United States','Design hybrid cloud and hybrid connectivity.')['status'],'us_remote_advertised')
