import contextlib
import io
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest

from scripts.export_dashboard import classify_contacts, export, posting_key


class DashboardExportTests(unittest.TestCase):
    def test_accessibility_address_is_not_a_resume_contact(self):
        job = {'public_recruiter_contact': 'accommodation@example.com; recruit@example.com',
               '_description': 'Request disability accommodation at accommodation@example.com. ' + 'Other details. '*40 +
                               'Send your resume to recruit@example.com.'}
        contacts = classify_contacts(job)
        self.assertEqual(contacts[0]['kind'], 'accessibility_only')
        self.assertEqual(contacts[1]['kind'], 'hiring')

    def test_legal_notice_using_careers_address_is_still_excluded(self):
        contacts = classify_contacts({'public_recruiter_contact': 'careers@example.com',
                                      '_description': 'If you need a reasonable accommodation, email careers@example.com.'})
        self.assertEqual(contacts[0]['kind'], 'accessibility_only')

    def test_review_identity_ignores_tracking_but_not_different_jobs(self):
        self.assertEqual(posting_key('https://www.linkedin.com/jobs/view/dev-at-company-123?trackingId=x'),
                         posting_key('https://www.linkedin.com/jobs/view/123'))
        self.assertNotEqual(posting_key('https://www.linkedin.com/jobs/view/123'), posting_key('https://www.linkedin.com/jobs/view/124'))
        self.assertNotEqual(posting_key('https://notlinkedin.com/jobs/view/123'), posting_key('https://www.linkedin.com/jobs/view/123'))
        self.assertNotEqual(posting_key('https://indeed.com/viewjob?jk=1'), posting_key('https://indeed.com/viewjob?jk=2'))

    def test_glassdoor_review_identity_keeps_listing_id(self):
        self.assertNotEqual(posting_key('https://glassdoor.com/job-listing/j?jl=1'), posting_key('https://glassdoor.com/job-listing/j?jl=2'))

    def test_export_excludes_raw_descriptions_and_attaches_reviews_to_exact_postings(self):
        with tempfile.TemporaryDirectory() as tmp, contextlib.redirect_stdout(io.StringIO()):
            root = Path(tmp); state = root/'seen.sqlite3'; db = sqlite3.connect(state)
            db.execute('CREATE TABLE jobs(data TEXT)')
            for jid in ('123','456'):
                row = {'title': 'Python Engineer', 'company_agency': 'Example', 'source_url': 'https://www.linkedin.com/jobs/view/'+jid,
                       'pipeline': 'contract', 'geography': 'US', 'fit_tier': '2 - remote contract',
                       'public_recruiter_contact': '', '_description': 'This full source description must not be exported.'}
                db.execute('INSERT INTO jobs VALUES (?)', (json.dumps(row),))
            db.execute('INSERT INTO jobs VALUES (?)', (json.dumps({'title':'Previously reported seed'}),))
            db.commit(); db.close()
            (root/'summary.json').write_text(json.dumps({'created_at':'2026-10-26T13:00:00+00:00'}),encoding='utf-8')
            review = {'match': {'source_url':'https://www.linkedin.com/jobs/view/123'}, 'verdict':'priority', 'summary':'Reviewed exact job'}
            (root/'reviews.json').write_text(json.dumps([review]),encoding='utf-8')
            export(state, root/'summary.json', root/'reviews.json', root/'dashboard.json')
            payload=json.loads((root/'dashboard.json').read_text(encoding='utf-8'))
            self.assertEqual(len(payload['leads']),2)
            self.assertEqual(sum(bool(row.get('qualification')) for row in payload['leads']),1)
            self.assertNotIn('full source description',(root/'dashboard.json').read_text(encoding='utf-8'))
            self.assertTrue(all('_description' not in row and 'public_recruiter_contact' not in row for row in payload['leads']))


if __name__ == '__main__':
    unittest.main()
