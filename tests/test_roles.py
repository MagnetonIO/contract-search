import copy,json,unittest
from pathlib import Path
from datetime import datetime,timezone
from scripts.sync_role_searches import sync
from runner import normalize

ROOT=Path(__file__).resolve().parents[1]
class RoleCoverage(unittest.TestCase):
    def test_leadership_title_survives_normalization_without_technical_keyword(self):
        for title in ['CTO','Chief Technology Officer','Forward Deployed Engineer','Lead Developer','Engineering Manager']:
            job=normalize({'title':title,'url':'https://example.com/1','description':'US remote contract opportunity.','employmentType':'Contract','location':'United States Remote'},'Test',datetime.now(timezone.utc))
            self.assertIsNotNone(job,title)
            self.assertTrue(job['role_families'],title)
    def test_sync_is_idempotent_and_preserves_spend_limits_and_devops(self):
        config=json.loads((ROOT/'config.json').read_text(encoding='utf-8'));roles=json.loads((ROOT/'web/lib/role-catalog.json').read_text(encoding='utf-8'))
        old=copy.deepcopy(config);new=sync(config,roles)
        self.assertEqual(new,old)
        self.assertEqual(sync(copy.deepcopy(new),roles),new)
        self.assertEqual(new['daily_cap_usd'],6);self.assertEqual(new['monthly_cap_usd'],50)
        for before,after in zip(old['actors'],new['actors']):
            self.assertEqual(before['cap_usd'],after['cap_usd']);self.assertEqual(before['max_items'],after['max_items'])
        dice=next(s for s in new['actors'] if s['name']=='Dice')
        self.assertIn('DevOps Kubernetes',dice['input']['searchQueries'])
