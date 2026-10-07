import test from "node:test";
import assert from "node:assert/strict";
import { resolveViewColumns, validateViewAlias } from "../../apps/web/helpers/project-view-config.ts";
const fields = [{ id: "amount", name: "Valor", type: "currency", project_id: "A", is_archived: false, options: [] }];
const config = {
  version: 2,
  columns: [
    { kind: "custom", field_id: "amount", alias: "Receita" },
    { kind: "builtin", key: "state" },
    { kind: "builtin", key: "cycle" },
  ],
  conditions: [],
  sort: null,
  group_by: null,
  metrics: [],
  stages: null,
  count_scopes: [],
};
test("stable mixed ordering and view aliases remain independent of shared names", () => {
  const columns = resolveViewColumns(config, fields, { cycle: false });
  assert.deepEqual(
    columns.map((c) => c.key),
    ["builtin:name", "custom:amount", "builtin:state"]
  );
  assert.equal(columns[1].title, "Receita");
  assert.equal(
    resolveViewColumns(config, [{ ...fields[0], name: "Montante" }], {}).find((c) => c.key === "custom:amount").title,
    "Receita"
  );
  const reset = {
    ...config,
    columns: config.columns.map((c) => {
      const { alias, ...rest } = c;
      return rest;
    }),
  };
  assert.equal(
    resolveViewColumns(reset, [{ ...fields[0], name: "Montante" }], {}).find((c) => c.key === "custom:amount").title,
    "Montante"
  );
  assert.equal(config.columns.length, 3, "resolver does not mutate the saved config");
});
test("Unicode aliases have backend-compatible 255-codepoint bounds", () => {
  assert.equal(validateViewAlias(" " + "😀".repeat(255) + " "), "😀".repeat(255));
  assert.throws(() => validateViewAlias("😀".repeat(256)));
  assert.throws(() => validateViewAlias("   "));
});
test("archived and unavailable columns remain historical/read-only; identity stays available", () => {
  const columns = resolveViewColumns(
    {
      ...config,
      columns: [
        { kind: "custom", field_id: "amount" },
        { kind: "custom", field_id: "missing" },
      ],
    },
    [{ ...fields[0], is_archived: true }],
    {}
  );
  assert.equal(columns[0].key, "builtin:name");
  assert.equal(columns[1].readOnly, true);
  assert.equal(columns[1].archived, true);
  assert.equal(columns[2].readOnly, true);
});
test("legacy empty columns preserve existing native visibility/order", () => {
  assert.deepEqual(
    resolveViewColumns({}, fields, { legacyColumns: ["priority", "state"], legacyCustomFields: ["amount"] }).map(
      (c) => c.key
    ),
    ["builtin:name", "builtin:priority", "builtin:state", "custom:amount"]
  );
});
