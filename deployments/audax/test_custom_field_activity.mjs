// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
import test from "node:test";
import assert from "node:assert/strict";
import * as helpers from "../../apps/web/helpers/custom-fields.ts";
const encoded = (type, value, extra = {}) =>
  JSON.stringify({ id: "field-id", label: "Historical name", type, value, ...extra });
const labels = { unset: "Não definido", yes: "Sim", no: "Não", unavailable_option: "Opção indisponível" };
const t = (key) => labels[key];
test("history formats exact decimals and separates zero false and unset", () => {
  assert.equal(
    helpers.formatCustomFieldSnapshot?.(encoded("currency", "9007199254740992.01"), t),
    "R$\u00a09.007.199.254.740.992,01"
  );
  assert.equal(helpers.formatCustomFieldSnapshot?.(encoded("currency", "0.00"), t), "R$\u00a00,00");
  assert.equal(helpers.formatCustomFieldSnapshot?.(encoded("checkbox", false), t), "Não");
  assert.equal(helpers.formatCustomFieldSnapshot?.(encoded("checkbox", null), t), "Não definido");
});
test("history uses captured names options and date-only values without live definitions", () => {
  const raw = encoded("select", "old-option", { option_label: "Former label" });
  assert.equal(helpers.parseCustomFieldSnapshot?.(raw)?.label, "Historical name");
  assert.equal(helpers.formatCustomFieldSnapshot?.(raw, t), "Former label");
  assert.equal(helpers.formatCustomFieldSnapshot?.(encoded("date", "2026-10-07"), t), "2026-10-07");
  assert.equal(
    helpers.formatCustomFieldSnapshot?.(encoded("text", "<img src=x onerror=alert(1)>"), t),
    "<img src=x onerror=alert(1)>"
  );
});
test("actual backend snapshots use the activity field for identity, not a JSON id", () => {
  const raw = JSON.stringify({ label: "Backend label", type: "currency", value: "0.10" });
  assert.equal(helpers.parseCustomFieldSnapshot?.(raw)?.label, "Backend label");
  assert.equal(helpers.formatCustomFieldSnapshot?.(raw, t), "R$\u00a00,10");
});
test("invalid snapshots fail safely without treating object data as text or executing markup", () => {
  for (const raw of [
    "bad json",
    "{}",
    "[]",
    "null",
    encoded("currency", "NaN"),
    encoded("text", { nested: "object" }),
  ]) {
    assert.equal(helpers.formatCustomFieldSnapshot?.(raw, t), "Não definido");
  }
});
