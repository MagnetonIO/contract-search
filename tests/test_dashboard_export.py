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
            content=json.loads((root/'job-content.json').read_text(encoding='utf-8'))
            self.assertEqual(content['generated_at'],payload['generated_at'])
            self.assertEqual(set(content['postings']),{lead['id'] for lead in payload['leads']})
            self.assertTrue(all('full source description' in item['text'] and len(item['hash']) == 64 for item in content['postings'].values()))
            self.assertEqual(len(payload['leads']),2)
            self.assertEqual(sum(bool(row.get('qualification')) for row in payload['leads']),1)
            self.assertNotIn('full source description',(root/'dashboard.json').read_text(encoding='utf-8'))
            self.assertTrue(all('_description' not in row and 'public_recruiter_contact' not in row for row in payload['leads']))


if __name__ == '__main__':
    unittest.main()


class SavedCoverageTests(unittest.TestCase):
    def test_throttling_shows_saved_opportunities_without_advancing_last_success(self):
        with tempfile.TemporaryDirectory() as tmp, contextlib.redirect_stdout(io.StringIO()):
            root=Path(tmp); db=sqlite3.connect(root/'seen.sqlite3')
            db.execute('CREATE TABLE jobs(data TEXT,last_seen TEXT)')
            job={'title':'Cloud platform solicitation','source':'US SAM.gov solicitations','source_url':'https://sam.gov/opp/abc/view','pipeline':'published_project_need','geography':'US','fit_tier':'project','public_recruiter_contact':''}
            last='2026-10-27T17:29:44+00:00'
            db.execute('INSERT INTO jobs VALUES (?,?)',(json.dumps(job),last));db.commit();db.close()
            (root/'summary.json').write_text(json.dumps({'created_at':'2026-10-27T23:00:00+00:00','source_coverage':[{'source':'US SAM.gov solicitations','status':'rate limited','raw':0,'detail':'HTTP 429'}]}),encoding='utf-8')
            (root/'config.json').write_text(json.dumps({'actors':[],'feeds':[{'name':'US SAM.gov solicitations','kind':'sam'}]}),encoding='utf-8')
            export(root/'seen.sqlite3',root/'summary.json',root/'reviews.json',root/'out.json',root/'config.json')
            payload=json.loads((root/'out.json').read_text(encoding='utf-8'));row=payload['summary']['source_coverage'][0]
            self.assertEqual(row['status'],'saved')
            self.assertEqual(row['saved_count'],1)
            self.assertEqual(row['last_success_at'],last)
            self.assertNotIn('429',row['detail'])
            self.assertIn('next_check_at',row)
            self.assertEqual(len(payload['leads']),1)

    def test_no_previous_collection_is_scheduled_without_fabricating_results(self):
        from scripts.export_dashboard import display_sam_history
        from datetime import datetime,timezone
        summary={'source_coverage':[{'source':'SAM','status':'scheduled','raw':0,'detail':'HTTP 429'}]}
        config={'feeds':[{'name':'SAM','kind':'sam'}]}
        with tempfile.TemporaryDirectory() as tmp:
            display_sam_history(summary,config,[],{},Path(tmp)/'missing.sqlite3',datetime(2026,10,30,20,tzinfo=timezone.utc))
        row=summary['source_coverage'][0]
        self.assertEqual(row['status'],'scheduled')
        self.assertNotIn('last_success_at',row)
        self.assertEqual(row['saved_count'],0)
        self.assertEqual(row['next_check_at'],'2026-11-02T14:07:00+00:00')

    def test_authentication_failure_remains_actionable(self):
        from scripts.export_dashboard import display_sam_history
        from datetime import datetime,timezone
        summary={'source_coverage':[{'source':'SAM','status':'failed','raw':0,'detail':'HTTP 403'}]}
        with tempfile.TemporaryDirectory() as tmp:
            display_sam_history(summary,{'feeds':[{'name':'SAM','kind':'sam'}]},[{'source':'SAM','pipeline':'published_project_need'}],{'SAM':'2026-10-27T12:00:00+00:00'},Path(tmp)/'missing.sqlite3',datetime(2026,10,27,23,tzinfo=timezone.utc))
        self.assertEqual(summary['source_coverage'][0]['status'],'failed')
        self.assertEqual(summary['source_coverage'][0]['detail'],'HTTP 403')

    def test_next_check_respects_quota_and_export_does_not_modify_it(self):
        from scripts.export_dashboard import display_sam_history
        from sam_quota import SamQuota
        from datetime import datetime,timezone
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'State with spaces – data'/ 'sam.sqlite3'
            now=datetime(2026,10,30,12,55,tzinfo=timezone.utc)
            quota=SamQuota(path,'synthetic-key')
            for n in range(8):quota.query({'previous':n},lambda:{},now=now.timestamp())
            before=path.read_bytes()
            summary={'source_coverage':[{'source':'SAM','status':'scheduled','raw':0}]}
            display_sam_history(summary,{'feeds':[{'name':'SAM','kind':'sam'}]},[],{},path,now)
            self.assertEqual(summary['source_coverage'][0]['next_check_at'],'2026-11-02T14:07:00+00:00')
            self.assertEqual(path.read_bytes(),before)
