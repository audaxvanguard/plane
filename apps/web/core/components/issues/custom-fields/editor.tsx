// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { useEffect, useRef, useState } from "react";
import type { CustomValue, TProjectCustomField } from "@plane/types";
import { formatBRL, normalizeCustomInput } from "../../../../helpers/custom-fields";

export type CustomFieldEditorProps = {
  field: TProjectCustomField;
  value?: CustomValue;
  onSave: (value: CustomValue) => Promise<unknown>;
  disabled?: boolean;
};

function initialInput(value: CustomValue | undefined): string {
  return value == null ? "" : String(value);
}

export function CustomFieldDisplay({ field, value }: { field: TProjectCustomField; value?: CustomValue }) {
  if (value == null) return <span className="text-custom-text-400">Unset</span>;
  if (field.type === "currency") return <span>{formatBRL(String(value))}</span>;
  if (field.type === "checkbox") return <span>{value ? "Checked" : "Unchecked"}</span>;
  if (field.type === "select") return <span>{field.options.find((option) => option.id === value)?.label ?? "Unavailable option"}</span>;
  return <span>{String(value)}</span>;
}

export function CustomFieldEditor({ field, value, onSave, disabled = false }: CustomFieldEditorProps) {
  const [draft, setDraft] = useState(initialInput(value));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => { if (!dirty) setDraft(initialInput(value)); }, [value, dirty]);
  const blocked = disabled || saving || field.is_archived;
  const change = (next: string) => { setDraft(next); setDirty(true); setError(null); };
  const save = async () => {
    if (blocked) return;
    setError(null);
    let scalar: CustomValue;
    try {
      scalar = field.type === "checkbox" ? (draft === "" ? null : draft === "true") : normalizeCustomInput(field, draft);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Invalid value.");
      return;
    }
    setSaving(true);
    try {
      await onSave(scalar);
      // Keep the saved draft until authoritative props arrive. A rejected save
      // never clears either the draft or the visible error.
      if (mounted.current) setError(null);
    } catch (error) {
      if (mounted.current) setError(error instanceof Error ? error.message : "Could not save. Your input has been retained.");
    } finally {
      if (mounted.current) setSaving(false);
    }
  };
  const inputClass = "w-full rounded border border-custom-border-200 bg-custom-background-100 px-2 py-1 text-sm";
  return (
    <div data-testid={`custom-field-${field.id}`} className="space-y-1">
      <label htmlFor={`custom-field-${field.id}-input`} className="text-sm font-medium">{field.name}</label>
      {field.description && <p className="text-xs text-custom-text-300">{field.description}</p>}
      {field.type === "checkbox" || field.type === "select" ? (
        <select id={`custom-field-${field.id}-input`} data-testid={`custom-field-${field.id}-input`} className={inputClass} value={draft} onChange={(event) => change(event.target.value)} disabled={blocked}>
          <option value="">Unset</option>
          {field.type === "checkbox" ? <><option value="true">Checked</option><option value="false">Unchecked</option></> : field.options.filter((option) => !option.is_retired || option.id === value).map((option) => <option key={option.id} value={option.id} disabled={option.is_retired}>{option.label}{option.is_retired ? " (retired)" : ""}</option>)}
        </select>
      ) : (
        <input id={`custom-field-${field.id}-input`} data-testid={`custom-field-${field.id}-input`} className={inputClass} type={field.type === "date" ? "date" : "text"} inputMode={field.type === "number" || field.type === "currency" ? "decimal" : undefined} value={draft} onChange={(event) => change(event.target.value)} disabled={blocked} />
      )}
      {field.is_archived && <span className="text-xs text-custom-text-300">Archived field — read only</span>}
      {!disabled && !field.is_archived && <button type="button" className="rounded bg-custom-primary-100 px-2 py-1 text-xs text-white" disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save"}</button>}
      {error && <p role="alert" className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
