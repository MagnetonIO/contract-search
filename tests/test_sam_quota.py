import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import runner


class SamQuotaTests(unittest.TestCase):
    def test_repeated_collection_reuses_persistent_responses(self):
        with tempfile.TemporaryDirectory() as tmp, patch('runner.load_secret',return_value='synthetic-key'), patch('runner.fetch',return_value={'opportunitiesData':[]}) as fetch:
            spec={'url':'https://api.sam.gov/opportunities/v2/search','state_path':str(Path(tmp)/'sam.sqlite3')}
            runner.collect_sam(spec);runner.collect_sam(spec)
            self.assertEqual(fetch.call_count,6)
            self.assertTrue(Path(spec['state_path']).exists())

    def test_429_stops_following_collection_before_network(self):
        with tempfile.TemporaryDirectory() as tmp, patch('runner.load_secret',return_value='synthetic-key'), patch('runner.fetch',side_effect=runner.SourceError('HTTP 429')) as fetch:
            spec={'url':'https://api.sam.gov/opportunities/v2/search','state_path':str(Path(tmp)/'sam.sqlite3')}
            for _ in range(2):
                with self.assertRaises(runner.SourceError):runner.collect_sam(spec)
            self.assertEqual(fetch.call_count,1)

    def test_ten_request_ceiling_persists_and_expires_after_24_hours(self):
        from sam_quota import SamQuota,SamDeferred
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'sam.sqlite3'
            quota=SamQuota(path,'synthetic-key')
            for n in range(10):quota.query({'title':str(n)},lambda:{'opportunitiesData':[]},now=100000)
            with self.assertRaises(SamDeferred):SamQuota(path,'synthetic-key').query({'title':'extra'},lambda:self.fail('Network called above quota'),now=100001)
            self.assertEqual(SamQuota(path,'synthetic-key').query({'title':'extra'},lambda:{'ok':True},now=186401),{'ok':True})

    def test_retry_after_survives_restart(self):
        from sam_quota import SamQuota,SamDeferred
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'sam.sqlite3';error=runner.SourceError('HTTP 429');error.retry_after_seconds=7200
            def fail():raise error
            with self.assertRaises(SamDeferred):SamQuota(path,'synthetic-key').query({'title':'test'},fail,now=100000)
            with self.assertRaises(SamDeferred):SamQuota(path,'synthetic-key').query({'title':'other'},lambda:self.fail('Network called during Retry-After'),now=107199)
            self.assertEqual(SamQuota(path,'synthetic-key').query({'title':'other'},lambda:{'ok':True},now=107201),{'ok':True})
