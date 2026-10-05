// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { useTranslation } from "@plane/i18n";
import type { TProjectCustomField, TIssueGroupByOptions, TIssueOrderByOptions } from "@plane/types";
import { FilterOption } from "../issue-layouts/filters/header/helpers/filter-option";

export function CustomFieldGroupOptions({ fields, selected, onChange }: {
  fields: TProjectCustomField[]; selected?: TIssueGroupByOptions; onChange: (value: TIssueGroupByOptions) => void;
}) {
  return <>{fields.filter((field) => !field.is_archived && ["select", "checkbox"].includes(field.type)).map((field) => {
    const value = `custom_field:${field.id}` as const;
    return <FilterOption key={field.id} title={field.name} multiple={false} isChecked={selected === value} onClick={() => onChange(value)} />;
  })}</>;
}

export function CustomFieldSortOptions({ fields, selected, onChange }: {
  fields: TProjectCustomField[]; selected?: TIssueOrderByOptions; onChange: (value: TIssueOrderByOptions) => void;
}) {
  const { t } = useTranslation();
  return <>{fields.filter((field) => !field.is_archived).flatMap((field) => (["asc", "desc"] as const).map((direction) => {
    const value = `custom_field:${field.id}:${direction}` as const;
    return <FilterOption key={value} title={`${field.name} — ${t("project_settings.custom_fields." + (direction === "asc" ? "ascending" : "descending"))}`}
      multiple={false} isChecked={selected === value} onClick={() => onChange(value)} />;
  }))}</>;
}
