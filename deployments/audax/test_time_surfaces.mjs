import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = (path) => readFileSync(new URL(`../../apps/web/core/components/issues/${path}`, import.meta.url), 'utf8');

test('quick view offers optional start and end editors', () => {
  const text = source('peek-overview/properties.tsx');
  assert.equal((text.match(/<OptionalIssueTime\b/g) || []).length, 2);
  assert.match(text, /value=\{issue\.start_time\}/);
  assert.match(text, /value=\{issue\.target_time\}/);
});
test('creation dialog includes form-controlled optional times', () => {
  const text = source('issue-modal/form.tsx');
  assert.match(text, /<IssueFormOptionalTimes\b/);
  const input = source('issue-modal/components/optional-times.tsx');
  assert.match(input, /useController/);
  assert.match(input, /type="time"/);
  assert.match(input, /timeField="start_time"/);
  assert.match(input, /timeField="target_time"/);
  assert.doesNotMatch(input, /required=\{true\}/);
});
test('creation date edits clear stale form times', () => {
  const text = source('issue-modal/components/default-properties.tsx');
  assert.match(text, /setValue\("start_time", null/);
  assert.match(text, /setValue\("target_time", null/);
});
