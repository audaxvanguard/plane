import assert from 'node:assert/strict';
import { test } from 'node:test';
import { localScheduleToUtc, utcScheduleToLocal } from '../../apps/web/helpers/optional-issue-time.ts';

test('São Paulo local time converts to UTC and back', () => {
  assert.equal(localScheduleToUtc('2026-10-01T14:30', 'America/Sao_Paulo'), '2026-10-01T17:30:00.000Z');
  assert.equal(utcScheduleToLocal('2026-10-01T17:30:00Z', 'America/Sao_Paulo'), '2026-10-01T14:30');
});
test('a different user sees the same instant on their local date', () => {
  assert.equal(utcScheduleToLocal('2026-10-01T01:30:00Z', 'America/Los_Angeles'), '2026-09-30T18:30');
});
test('DST offsets are date-specific', () => {
  assert.equal(localScheduleToUtc('2026-01-01T14:30', 'America/New_York'), '2026-01-01T19:30:00.000Z');
  assert.equal(localScheduleToUtc('2026-07-01T14:30', 'America/New_York'), '2026-07-01T18:30:00.000Z');
});
test('DST gaps are rejected rather than silently moving the time', () => {
  assert.throws(() => localScheduleToUtc('2026-03-08T02:30', 'America/New_York'));
});
test('empty optional time stays empty', () => {
  assert.equal(utcScheduleToLocal(null, 'UTC'), '');
});
test('invalid date and invalid timezone are rejected', () => {
  assert.throws(() => localScheduleToUtc('2026-02-30T12:00', 'UTC'));
  assert.throws(() => localScheduleToUtc('invalid', 'UTC'));
  assert.throws(() => localScheduleToUtc('2026-01-01T12:00', 'Not/AZone'));
});
test('half-hour offsets work', () => {
  assert.equal(localScheduleToUtc('2026-10-01T14:30', 'Asia/Kolkata'), '2026-10-01T09:00:00.000Z');
});
