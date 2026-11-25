"""Shared federal-holiday configuration for collection and hosted automation."""
from datetime import date, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo
import json

CALENDAR = json.loads((Path(__file__).resolve().parent / 'web/lib/schedule-pauses.json').read_text())

def federal_holidays(year):
    result = []
    for rule in CALENDAR['rules']:
        if year < rule.get('start_year', year):
            continue
        if 'day' in rule:
            day = date(year, rule['month'], rule['day'])
        elif rule['occurrence'] == -1:
            following = date(year + 1, 1, 1) if rule['month'] == 12 else date(year, rule['month'] + 1, 1)
            last = following - timedelta(days=1)
            day = last - timedelta(days=(last.isoweekday() - rule['iso_weekday']) % 7)
        else:
            first = date(year, rule['month'], 1)
            day = first + timedelta(days=(rule['iso_weekday'] - first.isoweekday()) % 7 + 7 * (rule['occurrence'] - 1))
        observed = day + timedelta(days=-1 if day.weekday() == 5 else 1 if day.weekday() == 6 else 0)
        result.append({'name': rule['name'], 'date': str(day), 'observed': str(observed)})
    return result

def schedule_pause_reason(now):
    local = now.astimezone(ZoneInfo(CALENDAR['timezone'])).date()
    day = str(local)
    if day in CALENDAR['dates']:
        return CALENDAR['dates'][day]
    for year in (local.year - 1, local.year, local.year + 1):
        for holiday in federal_holidays(year):
            if day in (holiday['date'], holiday['observed']):
                return holiday['name']
    return None
