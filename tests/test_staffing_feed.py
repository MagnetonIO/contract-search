import unittest
from unittest.mock import patch
from datetime import datetime,timezone
import runner

class StaffingFeedTests(unittest.TestCase):
    @patch('runner.fetch')
    def test_native_job_feed_preserves_dates_location_and_agency(self,fetch):
        fetch.return_value=[{'id':42,'status':'publish','link':'https://myticas.com/jobs/python-42/','date_gmt':'2026-10-14T12:00:00','title':{'rendered':'Python &amp; Azure Engineer'},'content':{'rendered':'<p>Remote contract. Send resume to hiring@example.com</p>'},'excerpt':{'rendered':'Location: Montreal, Quebec Remote: Remote Type: Contract'},'_embedded':{'wp:term':[[{'taxonomy':'matador-types','name':'Contract'},{'taxonomy':'matador-locations','name':'Montreal, Quebec'},{'taxonomy':'matador-locations','name':'Remote'}]]}}]
        rows=runner.collect_feed({'kind':'staffing','sites':[{'company':'Myticas Consulting','url':'https://myticas.com/wp-json/wp/v2/matador-job-listings?per_page=30&_embed=wp:term'}]})
        job=runner.normalize(rows[0],'Staffing firm career feeds',datetime.now(timezone.utc))
        self.assertEqual(job['title'],'Python & Azure Engineer')
        self.assertEqual(job['source_posted_at'],'2026-10-14T12:00:00+00:00')
        self.assertNotEqual(job['geography'],'US')
        self.assertEqual(job['direct_client_classification'],'agency / client unverified')
        self.assertEqual(job['application_url'],'https://myticas.com/jobs/python-42')

    @patch('runner.fetch',return_value={'error':'schema changed'})
    def test_malformed_feed_is_failure_not_empty_success(self,fetch):
        with self.assertRaises(runner.SourceError):runner.collect_feed({'kind':'staffing','sites':[{'company':'Myticas Consulting','url':'https://myticas.com/wp-json/wp/v2/matador-job-listings'}]})
