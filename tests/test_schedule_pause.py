from datetime import datetime, timezone
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import runner

class SchedulePauseTests(unittest.TestCase):
    def test_chicago_boundaries_and_automatic_resume(self):
        for instant, expected in [('2026-11-26T05:59:59+00:00', None), ('2026-11-26T06:00:00+00:00', 'Thanksgiving Day'), ('2026-11-27T05:59:59+00:00', 'Thanksgiving Day'), ('2026-11-27T06:00:00+00:00', None)]:
            self.assertEqual(runner.schedule_pause_reason(datetime.fromisoformat(instant)), expected)

    def test_force_cannot_start_sources_create_state_or_spend_on_the_paused_day(self):
        with tempfile.TemporaryDirectory() as temp, patch.object(runner, 'datetime', wraps=datetime) as clock, patch.object(runner, 'fetch', side_effect=AssertionError('No provider calls')):
            clock.now.return_value = datetime(2026, 11, 26, 15, 30, tzinfo=timezone.utc)
            state=Path(temp)/'state.sqlite3'
            self.assertEqual(runner.main(['--mode', 'daily', '--force', '--state', str(state), '--output', str(Path(temp)/'output')]), 0)
            self.assertFalse(state.exists())
            self.assertFalse((Path(temp)/'output').exists())

    def test_all_eleven_observed_dates_match_official_opm_fixtures(self):
        import json
        from schedule_calendar import federal_holidays
        fixture = json.loads((Path(__file__).parent/'federal-holiday-fixtures.json').read_text())
        for year, dates in fixture['observed'].items():
            self.assertEqual([h['observed'] for h in federal_holidays(int(year))], dates)
            for day in dates:
                self.assertIsNotNone(runner.schedule_pause_reason(datetime.fromisoformat(day+'T16:00:00+00:00')))

    def test_weekend_actual_and_observed_holidays_including_next_year_new_year(self):
        for day in ['2026-07-03','2026-07-04','2027-06-18','2027-06-19','2027-07-04','2027-07-05','2027-12-24','2027-12-25','2027-12-31','2028-01-01']:
            self.assertIsNotNone(runner.schedule_pause_reason(datetime.fromisoformat(day+'T16:00:00+00:00')))
        self.assertIsNone(runner.schedule_pause_reason(datetime.fromisoformat('2027-12-31T05:59:59+00:00')))
        self.assertEqual(runner.schedule_pause_reason(datetime.fromisoformat('2027-12-31T06:00:00+00:00')), "New Year's Day")
        self.assertIsNone(runner.schedule_pause_reason(datetime.fromisoformat('2028-01-02T06:00:00+00:00')))
