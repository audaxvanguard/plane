// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
import type { CustomValue, TProjectCustomField, TProjectCustomViewConfig } from "@plane/types";

export const CUSTOM_FIELD_PREFIX = "custom_field:";
export function customGroupValue(values: Record<string, CustomValue> = {}, fieldId: string): string {
  const value = values[fieldId];
  return value == null ? "unset" : String(value);
}

/** Native display settings are persisted as normal project user preferences. */
export function nativeCustomView(groupBy?: string | null, orderBy?: string): TProjectCustomViewConfig | undefined {
  const group = groupBy?.startsWith(CUSTOM_FIELD_PREFIX) ? groupBy.slice(CUSTOM_FIELD_PREFIX.length) : null;
  const match = orderBy?.match(/^custom_field:(.+):(asc|desc)$/);
  if (!group && !match) return undefined;
  return { version: 1, columns: [], conditions: [], metrics: [], group_by: group ? { field_id: group } : null,
    sort: match ? { field_id: match[1], direction: match[2] as "asc" | "desc" } : null };
}

/** Native one-group pagination expects an ungrouped result page. */
export function customGroupPage(config: TProjectCustomViewConfig, groupId: string): TProjectCustomViewConfig {
  if (!config.group_by) return config;
  const field_id = config.group_by.field_id;
  const condition = groupId === "unset" ? { field_id, operator: "is_unset" as const }
    : { field_id, operator: "eq" as const, value: groupId === "true" ? true : groupId === "false" ? false : groupId };
  return { ...config, group_by: null, conditions: [...config.conditions, condition] };
}

/** Reuse native column/payload contracts without confusing false with unset. */
export function customGroupColumns(field: TProjectCustomField, label: (key: string) => string) {
  const values = field.type === "checkbox" ? [
    { id: "true", name: label("yes"), value: true },
    { id: "false", name: label("no"), value: false },
  ] : field.type === "select" ? field.options.map((option) => ({ id: option.id, name: option.label, value: option.id })) : [];
  if (!["checkbox", "select"].includes(field.type)) return [];
  return [...values, { id: "unset", name: label("unset"), value: null }].map(({ id, name, value }) => ({
    id, name, payload: { custom_values: { [field.id]: value } },
    ...(field.is_archived || field.options.some((option) => option.id === id && option.is_retired) ? { disableIssueCreation: true } : {}),
  }));
}

/** Keep PATCH sparse; untouched archived/retired values must not be resubmitted. */
export function pickDirtyCustomValues(values: Record<string, CustomValue> = {}, dirty: Record<string, unknown> = {}) {
  return Object.fromEntries(Object.entries(values).filter(([id]) => dirty[id] === true));
}

export function hasCustomValues(values: Record<string, CustomValue> = {}): boolean {
  return Object.values(values).some((value) => value != null);
}

/** Formats arbitrary-size decimal strings without ever converting cents to Number. */
export function formatBRL(value: string): string {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) throw new Error("Invalid BRL amount.");
  const whole = BigInt(match[2]).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${match[1]}R$\u00a0${whole},${(match[3] ?? "").padEnd(2, "0")}`;
}

export function normalizeCustomInput(field: TProjectCustomField, raw: string | boolean): CustomValue {
  if (typeof raw === "string" && !raw.trim()) return null;
  if (field.type === "checkbox") {
    if (typeof raw !== "boolean") throw new Error("Choose checked, unchecked or unset.");
    return raw;
  }
  if (typeof raw !== "string") throw new Error("Enter a valid value.");
  if (field.type === "text") {
    if (Array.from(raw).length > 2000) throw new Error("Use at most 2,000 characters.");
    return raw;
  }
  if (field.type === "currency" || field.type === "number") {
    let value = raw.trim().replace(/^R\$\s*/, "");
    if (value.includes(",")) {
      if (!/^[+-]?(?:\d+|\d{1,3}(?:\.\d{3})+),\d+$/.test(value)) throw new Error("Enter a valid decimal amount.");
      value = value.replace(/\./g, "").replace(",", ".");
    }
    const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(value);
    const scale = field.type === "currency" ? 2 : 6;
    const wholeLimit = field.type === "currency" ? 16 : 18;
    if (!match || (match[3]?.length ?? 0) > scale) throw new Error(`Use at most ${scale} decimal places.`);
    const whole = BigInt(match[2]).toString();
    if (whole.length > wholeLimit) throw new Error("Amount exceeds the supported range.");
    const fraction = field.type === "currency" ? (match[3] ?? "").padEnd(2, "0") : (match[3] ?? "").replace(/0+$/, "");
    const negative = match[1] === "-" && (whole !== "0" || /[1-9]/.test(fraction));
    return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
  }
  if (field.type === "date") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new Error("Enter a date as YYYY-MM-DD.");
    const date = new Date(`${raw}T00:00:00Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== raw) throw new Error("Enter a valid calendar date.");
    return raw;
  }
  const option = field.options.find((option) => option.id === raw);
  if (!option || option.is_retired) throw new Error("Choose an available option.");
  return option.id;
}
