// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
export type TCustomFieldKind = "text" | "number" | "currency" | "date" | "checkbox" | "select";
export type CustomValue = string | boolean | null;
export type TCustomValues = Record<string, CustomValue>;
export type TCustomFieldOption = { id: string; label: string; color: string; sort_order: number; is_retired: boolean };
export type TProjectCustomField = {
  id: string; project_id: string; name: string; description: string; type: TCustomFieldKind;
  sort_order: number; is_archived: boolean; options: TCustomFieldOption[];
};
export type TCustomBuiltinColumn = "name" | "identifier" | "state" | "priority" | "assignees" | "labels" |
  "start_date" | "target_date" | "created_at" | "updated_at" | "estimate" | "cycle" | "modules";
export type TCustomViewColumn = { kind: "builtin"; key: TCustomBuiltinColumn } | { kind: "custom"; field_id: string };
export type TCustomCondition = {
  field_id: string; operator: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains" | "not_contains" | "is_set" | "is_unset";
  value?: CustomValue;
};
export type TCustomMetricScope = "all" | "open" | "filtered";
export type TProjectCustomViewConfig = {
  version: 1; columns: TCustomViewColumn[]; conditions: TCustomCondition[];
  sort: { field_id: string; direction: "asc" | "desc" } | null;
  group_by: { field_id: string } | null;
  metrics: { field_id: string; scopes: TCustomMetricScope[] }[];
};
export type TCustomAggregateScope = { total: string; item_count: number; valued_count: number; missing_count: number };
export type TCustomFieldAggregates = {
  metrics: {
    field_id: string; type: "currency" | "number"; scopes: Partial<Record<TCustomMetricScope, TCustomAggregateScope>>;
    groups: { key: string; label: string; scopes: Partial<Record<TCustomMetricScope, TCustomAggregateScope>> }[];
  }[];
  groups_may_overlap: boolean;
};
