// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { CustomValue, TProjectCustomField } from "@plane/types";
import { formatBRL, normalizeCustomInput } from "../../../../helpers/custom-fields";
import { CustomFieldControl } from "./control";
export { CustomFieldGroupOptions, CustomFieldSortOptions } from "./view-options";

export type CustomFieldEditorProps = {
  field: TProjectCustomField;
  value?: CustomValue;
  onSave?: (value: CustomValue) => Promise<unknown>;
  /** Form mode: register canonical values in the item form; no per-field save. */
  onChange?: (value: CustomValue) => void;
  disabled?: boolean;
};
function initialInput(value: CustomValue | undefined): string {
  return value == null ? "" : String(value);
}
export function CustomFieldDisplay({ field, value }: { field: TProjectCustomField; value?: CustomValue }) {
  const { t } = useTranslation();
  const key = "project_settings.custom_fields.";
  if (value == null) return <span className="text-placeholder">{t(key + "unset")}</span>;
  if (field.type === "currency") return <span>{formatBRL(String(value))}</span>;
  if (field.type === "checkbox") return <span>{t(key + (value ? "yes" : "no"))}</span>;
  if (field.type === "select") return <span>{field.options.find((option) => option.id === value)?.label ?? t(key + "unavailable_option")}</span>;
  return <span>{String(value)}</span>;
}

/** Native card/list property chips, in the user's saved display order. */
export function CustomFieldChips({ fields, selected = [], values = {}, aliases = {} }: {
  fields: TProjectCustomField[]; selected?: string[]; values?: Record<string, CustomValue>; aliases?:Record<string,string>;
}) {
  return <>{selected.map((id) => {
    const field = fields.find((field) => field.id === id);
    if (!field) return null;
    return <span key={id} data-testid={`custom-property-${id}`} title={aliases[id] ?? (field.description || field.name)}
      className="inline-flex h-5 max-w-56 shrink-0 items-center gap-1 overflow-hidden rounded-sm border-[0.5px] border-strong px-2 text-caption-sm-regular text-secondary">
      <span className="truncate text-tertiary">{aliases[id] ?? field.name}:</span> <span className="truncate"><CustomFieldDisplay field={field} value={values[id]} /></span>
    </span>;
  })}</>;
}

export function CustomFieldEditor({ field, value, onSave, onChange, disabled = false }: CustomFieldEditorProps) {
  const { t } = useTranslation();
  const key = "project_settings.custom_fields.";
  const [draft, setDraft] = useState(initialInput(value));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const lastFormValue = useRef(value);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    if (onChange && value !== lastFormValue.current) {
      // RHF reset/project switch is authoritative; don't display a previous
      // item's draft while the submitted form value is now blank.
      lastFormValue.current = value;
      setDraft(initialInput(value)); setDirty(false); setError(null);
    } else if (!dirty) setDraft(initialInput(value));
  }, [value, dirty, onChange]);
  const blocked = disabled || saving || field.is_archived;
  const change = (next: string) => {
    setDraft(next); setDirty(true); setError(null);
    if (onChange) {
      try {
        const scalar = field.type === "checkbox" ? (next === "" ? null : next === "true") : normalizeCustomInput(field, next);
        lastFormValue.current = scalar;
        onChange(scalar);
      } catch {
        // Retain invalid input in the form too, so form validation blocks submit.
        lastFormValue.current = next;
        onChange(next); setError(t(key + "invalid_value"));
      }
    }
  };
  const save = async () => {
    if (blocked || !onSave) return;
    setError(null);
    let scalar: CustomValue;
    try {
      scalar = field.type === "checkbox" ? (draft === "" ? null : draft === "true") : normalizeCustomInput(field, draft);
    } catch {
      setError(t(key + "invalid_value"));
      return;
    }
    setSaving(true);
    try {
      await onSave(scalar);
      // Do not replace the entered draft with stale/optimistic props.
      if (mounted.current) setError(null);
    } catch {
      if (mounted.current) setError(t(key + "save_error"));
    } finally {
      if (mounted.current) setSaving(false);
    }
  };
  return <div data-testid={`custom-field-${field.id}`} className="space-y-1.5">
    <label htmlFor={`custom-field-${field.id}-input`} className="text-body-xs-medium text-secondary">{field.name}</label>
    {field.description && <p className="text-caption-sm-regular text-tertiary">{field.description}</p>}
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1"><CustomFieldControl field={field} draft={draft} currentValue={initialInput(value)} onChange={change} disabled={blocked} error={error} /></div>
      {onSave && !disabled && !field.is_archived && <Button variant="secondary" size="base" disabled={saving} loading={saving} onClick={() => void save()}>{t(key + (saving ? "saving" : "save"))}</Button>}
    </div>
    {field.is_archived && <span className="text-caption-sm-regular text-tertiary">{t(key + "archived_read_only")}</span>}
    {error && <p id={`custom-field-${field.id}-input-error`} role="alert" className="text-caption-sm-regular text-danger-primary">{error}</p>}
  </div>;
}
