from datetime import datetime, timezone
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import runner

class SchedulePauseTests(unittest.TestCase):
    def test_chicago_boundaries_and_automatic_resume(self):
        for instant, expected in [('2026-11-26T05:59:59+00:00', None), ('2026-11-26T06:00:00+00:00', 'Thanksgiving'), ('2026-11-27T05:59:59+00:00', 'Thanksgiving'), ('2026-11-27T06:00:00+00:00', None)]:
            self.assertEqual(runner.schedule_pause_reason(datetime.fromisoformat(instant)), expected)

    def test_force_cannot_start_sources_create_state_or_spend_on_the_paused_day(self):
        with tempfile.TemporaryDirectory() as temp, patch.object(runner, 'datetime', wraps=datetime) as clock, patch.object(runner, 'fetch', side_effect=AssertionError('No provider calls')):
            clock.now.return_value = datetime(2026, 11, 26, 15, 30, tzinfo=timezone.utc)
            state=Path(temp)/'state.sqlite3'
            self.assertEqual(runner.main(['--mode', 'daily', '--force', '--state', str(state), '--output', str(Path(temp)/'output')]), 0)
            self.assertFalse(state.exists())
            self.assertFalse((Path(temp)/'output').exists())
