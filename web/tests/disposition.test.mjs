import test from 'node:test';
import assert from 'node:assert/strict';
import { recordDisposition, purgeRemoved } from '../lib/disposition.mjs';
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

test('not a fit is separate from Removed and restores the original application history', () => {
  const lead = { pipeline: 'contract' };
  const current = { stage: 'applied', notes: 'Prior submission', events: [{ id: 'receipt' }] };
  const rejected = recordDisposition(current, 'not_a_fit');
  assert.ok(leadInView(lead, rejected, 'not_a_fit'));
  for (const view of ['opportunities', 'removed', 'applied', 'saved', 'review']) assert.equal(leadInView(lead, rejected, view), false);
  assert.equal(purgeRemoved({ job: rejected }, ['job']).count, 0, 'Delete all Removed does not clear Not a fit');
  assert.deepEqual(recordDisposition(rejected, 'restore').events, current.events);
  assert.ok(leadInView(lead, recordDisposition(rejected, 'restore'), 'applied'));
});

test('existing Not a fit stages move into the dedicated section without migration', () => {
  const lead = { pipeline: 'contract' }, old = { stage: 'not_a_fit', notes: 'Legacy decision' };
  assert.ok(leadInView(lead, old, 'not_a_fit'));
  assert.equal(leadInView(lead, old, 'opportunities'), false);
  assert.equal(leadInView(lead, old, 'removed'), false);
  const restored = recordDisposition(old, 'restore');
  assert.equal(restored.notes, old.notes);
  assert.ok(leadInView(lead, restored, 'opportunities'));
});

test('delete all clears only the selected removed records and keeps suppression after recollection', () => {
  const workflow = {
    a: recordDisposition({ stage: 'applied', notes: 'history', events: [{ id: 'submitted' }] }, 'closed'),
    b: recordDisposition(undefined, 'deleted'),
    restored: { stage: 'saved', notes: 'keep' },
    later: recordDisposition(undefined, 'closed'),
  };
  const result = purgeRemoved(workflow, ['a', 'a', 'b', 'restored', 'unknown']);
  assert.equal(result.count, 2);
  assert.equal(workflow.a.disposition.status, 'closed', 'input is not mutated');
  assert.equal(result.workflow.restored, workflow.restored, 'concurrently restored records are protected');
  assert.equal(result.workflow.later, workflow.later, 'newly removed records outside selection are protected');
  assert.deepEqual(result.workflow.a.events, workflow.a.events);
  assert.equal(result.workflow.a.stage, 'applied');
  for (const view of ['opportunities', 'removed', 'applied', 'review']) assert.equal(leadInView({ id: 'a', pipeline: 'contract' }, result.workflow.a, view), false);
  assert.equal(purgeRemoved(result.workflow, ['a', 'b']).count, 0, 'retry is idempotent');
});
