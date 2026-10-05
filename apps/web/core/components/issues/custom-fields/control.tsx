// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { useTranslation } from "@plane/i18n";
import { Input } from "@plane/propel/input";
import type { TProjectCustomField } from "@plane/types";
import { CustomFieldChoice } from "./choice";

export function CustomFieldControl({ field, draft, onChange, disabled, error, currentValue }: {
  field: TProjectCustomField; draft: string; onChange: (value: string) => void;
  disabled?: boolean; error?: string | null; currentValue?: string;
}) {
  const { t } = useTranslation();
  const key = "project_settings.custom_fields.";
  const id = `custom-field-${field.id}-input`;
  if (field.type === "checkbox" || field.type === "select") {
    const choices = [{ value: "", label: t(key + "unset") }, ...(field.type === "checkbox"
      ? [{ value: "true", label: t(key + "yes") }, { value: "false", label: t(key + "no") }]
      : field.options.filter((option) => !option.is_retired || option.id === currentValue).map((option) => ({
        value: option.id, label: option.label + (option.is_retired ? ` (${t(key + "retired")})` : ""),
        color: option.color, disabled: option.is_retired,
      })))];
    return <CustomFieldChoice id={id} label={field.name} value={draft} choices={choices} disabled={disabled} onChange={onChange} />;
  }
  return <Input id={id} data-testid={id} aria-label={field.name} aria-describedby={error ? `${id}-error` : undefined}
    inputSize="xs" className="w-full min-w-0" hasError={Boolean(error)}
    type={field.type === "date" ? "date" : "text"}
    inputMode={field.type === "number" || field.type === "currency" ? "decimal" : undefined}
    placeholder={field.type === "currency" ? "R$ 0,00" : t(key + "unset")}
    value={draft} onChange={(event) => onChange(event.target.value)} disabled={disabled} />;
}
