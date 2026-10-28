import test from 'node:test';
import assert from 'node:assert/strict';
import { recordDisposition } from '../lib/disposition.mjs';
import { leadInView } from '../lib/shared.mjs';

test('closed and deleted records stay hidden after recollection and preserve submission history', () => {
  const lead = { id: 'same-id', pipeline: 'contract', qualification: {} };
  const current = { stage: 'applied', notes: 'Keep this', events: [{ id: 'receipt' }], application: { submission_recorded_at: '2026-10-28' } };
  for (const action of ['closed', 'deleted']) {
    const removed = recordDisposition(current, action);
    assert.equal(removed.stage, 'applied');
    assert.deepEqual(removed.events, current.events);
    assert.deepEqual(removed.application, current.application);
    assert.equal(removed.notes, current.notes);
    for (const view of ['opportunities', 'review', 'saved', 'contacted', 'applied', 'email_review', 'projects', 'secondary']) assert.equal(leadInView({ ...lead }, removed, view), false);
    assert.ok(leadInView(lead, removed, 'removed'));
    assert.equal(recordDisposition(removed, action), removed, 'repeat action is idempotent');
    const restored = recordDisposition(removed, 'restore');
    assert.equal(restored.disposition, undefined);
    assert.ok(leadInView(lead, restored, 'applied'));
    assert.equal(leadInView(lead, restored, 'removed'), false);
  }
});

test('removing an untouched opportunity does not report an application', () => {
  const removed = recordDisposition(undefined, 'closed');
  assert.equal(removed.stage, 'new');
  assert.equal(removed.application, undefined);
  assert.equal(removed.events, undefined);
  assert.ok(leadInView({ pipeline: 'contract' }, recordDisposition(removed, 'restore'), 'opportunities'));
});
