import test from "node:test";
import assert from "node:assert/strict";
import { columnKey, projectQueryConfig, configurationFromView } from "../../apps/web/helpers/project-view-config.ts";
const config = {
  version: 2,
  columns: [{ kind: "custom", field_id: "amount", alias: "Receita" }],
  conditions: [{ field_id: "amount", operator: "gte", value: "0.10" }],
  sort: { field_id: "amount", direction: "desc" },
  group_by: null,
  metrics: [{ field_id: "amount", scopes: ["all", "open", "filtered"] }],
  stages: { source: "state", order: ["won"], hidden: ["lost"], aliases: { won: "Ganho" } },
  count_scopes: ["filtered"],
};
test("effective query preserves full aliases/conditions/metrics without mutating saved inputs", () => {
  const saved = {
    id: "view",
    project: "project",
    display_filters: { layout: "list", group_by: "state" },
    display_properties: {},
    rich_filters: null,
    custom_view: config,
  };
  const working = configurationFromView(saved);
  assert.equal(working.display_filters.order_by, "custom_field:amount:desc");
  assert.deepEqual(projectQueryConfig(working), config);
  working.custom_view.columns[0].alias = "Local";
  assert.equal(saved.custom_view.columns[0].alias, "Receita");
  assert.equal(columnKey(config.columns[0]), "custom:amount");
  assert.equal(columnKey({ kind: "builtin", key: "state" }), "builtin:state");
});
test("group/sort changes retain other query semantics, incompatible stage presentation is cleared", () => {
  const working = configurationFromView({
    custom_view: config,
    display_filters: { group_by: "state" },
    display_properties: {},
    rich_filters: null,
  });
  working.display_filters.group_by = "custom_field:qualified";
  working.display_filters.order_by = "-created_at";
  const effective = projectQueryConfig(working);
  assert.deepEqual(effective.group_by, { field_id: "qualified" });
  assert.equal(effective.sort, null);
  assert.equal(effective.stages, null);
  assert.deepEqual(effective.conditions, config.conditions);
  assert.deepEqual(effective.metrics, config.metrics);
});
test("legacy empty/v1 config is supported; unknown schemas fail closed", () => {
  assert.deepEqual(projectQueryConfig(configurationFromView({ display_filters: {}, custom_view: {} })), {});
  const v1 = { ...config, version: 1, columns: [{ kind: "custom", field_id: "amount" }] };
  delete v1.stages;
  delete v1.count_scopes;
  assert.deepEqual(projectQueryConfig(configurationFromView({ custom_view: v1, display_filters: {} })), v1);
  assert.throws(() => projectQueryConfig(configurationFromView({ custom_view: { version: 99 }, display_filters: {} })));
  const unknown = configurationFromView({
    custom_view: { ...v1, conditions: [{ field_id: "foreign", operator: "is_set" }] },
    display_filters: {},
  });
  assert.equal(
    projectQueryConfig(unknown).conditions[0].field_id,
    "foreign",
    "invalid references remain for server rejection; never broaden by dropping a condition"
  );
});
