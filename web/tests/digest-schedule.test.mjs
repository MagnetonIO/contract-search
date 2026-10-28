import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { digestWindow, cronAuthorized } from '../lib/digest-schedule.mjs';
import { sendDailyDigest } from '../lib/digest.mjs';

test('morning window follows Chicago DST and refuses afternoon and early sends', () => {
  for (const utcHour of [14, 15]) {
    const month = utcHour === 14 ? '07' : '01';
    assert.equal(digestWindow(new Date(`2026-${month}-15T${utcHour}:16:00Z`)).allowed, false);
    assert.equal(digestWindow(new Date(`2026-${month}-15T${utcHour}:17:00Z`)).allowed, true);
    assert.equal(digestWindow(new Date(`2026-${month}-15T${utcHour + 2}:00:00Z`)).allowed, false);
  }
  assert.equal(digestWindow(new Date('2026-10-28T19:38:00Z')).allowed, false);
  assert.equal(digestWindow(new Date('2026-10-29T00:30:00Z')).day, '2026-10-28');
});

test('both UTC cron slots cover the morning across DST changes', async () => {
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url)));
  for (const day of ['2026-07-15', '2026-01-15', '2026-03-08', '2026-11-01']) {
    const allowed = config.crons.filter(job => {
      const [minute, hour] = job.schedule.split(' ');
      return digestWindow(new Date(`${day}T${hour}:${minute}:00Z`)).allowed;
    });
    assert.ok(allowed.length >= 1, day);
  }
});

test('cron requires the exact server-side bearer secret', () => {
  const secret = 'a'.repeat(64);
  assert.ok(cronAuthorized('Bearer ' + secret, secret));
  for (const header of [null, '', secret, 'Bearer wrong']) assert.equal(cronAuthorized(header, secret), false);
  assert.equal(cronAuthorized('Bearer undefined', undefined), false);
});

test('primary and backup send once; late trigger preserves the cutoff for tomorrow', async () => {
  let value = null, version = 0, sends = 0, reads = 0;
  const store = {
    read: async () => ({ value: structuredClone(value), version: version || null }),
    write: async (_key, next, expected) => { assert.equal(expected, version || null); value = structuredClone(next); return ++version; },
    conflict: () => false,
  };
  const snapshotReader = async () => { reads++; return { value: { collected_at: '2026-10-28T13:00:00Z', leads: [], summary: { target: 50, source_coverage: [] } } }; };
  const send = async () => { sends++; return 'receipt'; };
  const options = { store, snapshotReader, send, apiKey: 'test' };
  assert.equal((await sendDailyDigest({ ...options, now: new Date('2026-10-28T14:17:00Z') })).status, 'accepted');
  await sendDailyDigest({ ...options, now: new Date('2026-10-28T15:17:00Z') });
  assert.equal(sends, 1);
  const saved = structuredClone(value), before = reads;
  assert.equal((await sendDailyDigest({ ...options, now: new Date('2026-10-28T19:38:00Z') })).status, 'outside_morning_window');
  assert.equal(reads, before);
  assert.deepEqual(value, saved);
});

test('daily email excludes closed and deleted opportunities', async () => {
  let record = null, version = 0, sent;
  const store = {
    read: async key => key === 'workflow.json' ? { value: { closed: { disposition: { status: 'closed' } }, deleted: { disposition: { status: 'deleted' } }, notfit: {disposition:{status:'not_a_fit'}}, legacy: {stage:'not_a_fit'} } } : { value: structuredClone(record), version: version || null },
    write: async (_key, value) => { record = structuredClone(value); return ++version; }, conflict: () => false,
  };
  const snapshotReader = async () => ({ value: { collected_at: '2026-10-28T13:00:00Z', leads: ['open', 'closed', 'deleted', 'notfit', 'legacy'].map(id => ({ id, title: id, pipeline: 'contract', first_seen: '2026-10-28T12:00:00Z', pay: 'unknown', review_score: 0 })), summary: { target: 50, source_coverage: [] } } });
  const result = await sendDailyDigest({ now: new Date('2026-10-28T14:17:00Z'), apiKey: 'test', store, snapshotReader, send: async payload => { sent = payload; return 'receipt'; } });
  assert.equal(result.count, 1);
  assert.match(sent.text, /1\. open/);
  assert.doesNotMatch(sent.text, /\?lead=(closed|deleted|notfit|legacy)/);
});
