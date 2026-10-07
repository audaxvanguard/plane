import test from "node:test";
import assert from "node:assert/strict";
import { applyStagePresentation, customStageMovePayload } from "../../apps/web/helpers/project-view-config.ts";
const stages = { source: "custom", field_id: "stage", order: ["b", "a"], hidden: ["a"], aliases: { b: "Proposta" } };
test("stage aliases/order/hiding do not mutate definitions or query membership", () => {
  const columns = [
    { id: "a", name: "A", payload: {} },
    { id: "b", name: "B", payload: {} },
    { id: "unset", name: "Unset", payload: {} },
  ];
  assert.deepEqual(
    applyStagePresentation(columns, stages).map((c) => [c.id, c.name]),
    [
      ["b", "Proposta"],
      ["unset", "Unset"],
    ]
  );
  assert.equal(columns[1].name, "B");
});
test("stage presentation supports ES2022 without Array.toSorted and preserves source order", () => {
  const descriptor = Object.getOwnPropertyDescriptor(Array.prototype, "toSorted");
  const columns = Object.freeze([
    { id: "a", name: "A" },
    { id: "b", name: "B" },
  ]);
  // Simulate ES2022 for this synchronous test, restoring the capability in finally.
  /* eslint-disable no-extend-native */
  try {
    Object.defineProperty(Array.prototype, "toSorted", { value: undefined, configurable: true });
    assert.deepEqual(
      applyStagePresentation(columns, stages).map((column) => column.id),
      ["b"]
    );
    assert.deepEqual(
      columns.map((column) => column.id),
      ["a", "b"]
    );
  } finally {
    if (descriptor) Object.defineProperty(Array.prototype, "toSorted", descriptor);
    else delete Array.prototype.toSorted;
  }
  /* eslint-enable no-extend-native */
});
test("supported custom stage move payloads preserve false/null and reject retired/archived targets", () => {
  const field = {
    id: "stage",
    type: "select",
    is_archived: false,
    options: [
      { id: "a", is_retired: false },
      { id: "b", is_retired: true },
    ],
  };
  assert.deepEqual(customStageMovePayload(field, "a"), { custom_values: { stage: "a" } });
  assert.deepEqual(customStageMovePayload(field, "unset"), { custom_values: { stage: null } });
  assert.throws(() => customStageMovePayload(field, "b"));
  assert.throws(() => customStageMovePayload({ ...field, is_archived: true }, "a"));
  assert.throws(() => customStageMovePayload(field, "foreign"));
  assert.deepEqual(customStageMovePayload({ ...field, type: "checkbox" }, "false"), {
    custom_values: { stage: false },
  });
});
