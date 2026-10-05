// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { useState } from "react";
import type { TProjectCustomField, TCustomFieldKind, TCustomFieldOption } from "@plane/types";

type Props = {
  fields: TProjectCustomField[];
  onCreate: (data: { name: string; type: TCustomFieldKind }) => Promise<unknown>;
  onUpdate: (id: string, data: Partial<TProjectCustomField>) => Promise<unknown>;
  onCreateOption: (fieldId: string, data: Partial<TCustomFieldOption>) => Promise<unknown>;
  onUpdateOption: (fieldId: string, optionId: string, data: Partial<TCustomFieldOption>) => Promise<unknown>;
};
const kinds: TCustomFieldKind[] = ["text", "number", "currency", "date", "checkbox", "select"];
const input = "rounded border border-custom-border-200 bg-custom-background-100 px-3 py-2 text-sm";
const button = "rounded border border-custom-border-200 px-3 py-2 text-sm disabled:opacity-50";

export function CustomFieldSettings({ fields, onCreate, onUpdate, onCreateOption, onUpdateOption }: Props) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<TCustomFieldKind>("text");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const perform = async (action: () => Promise<unknown>) => {
    if (pending) return;
    setPending(true); setError(null);
    try { await action(); }
    catch { setError("Could not save this field. Check for a duplicate name, limits or permissions; your input is retained."); }
    finally { setPending(false); }
  };
  return <section className="space-y-6 p-6">
    <div><h2 className="text-lg font-semibold">Custom fields</h2><p className="text-sm text-custom-text-300">Optional fields for every work item in this project. All currency values use BRL. Field types cannot change after creation.</p></div>
    <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => { event.preventDefault(); void perform(async () => { await onCreate({ name: name.trim(), type: kind }); setName(""); }); }}>
      <label className="flex flex-col gap-1 text-sm">Field name<input className={input} value={name} onChange={(event) => setName(event.target.value)} required maxLength={255} /></label>
      <label htmlFor="custom-field-type" className="flex flex-col gap-1 text-sm">Field type</label><select id="custom-field-type" className={input} value={kind} onChange={(event) => setKind(event.target.value as TCustomFieldKind)}>{kinds.map((kind) => <option key={kind} value={kind}>{kind === "currency" ? "Currency (BRL)" : kind}</option>)}</select>
      <button className={button} disabled={pending || !name.trim() || fields.filter((field) => !field.is_archived).length >= 50}>Create field</button>
    </form>
    {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
    <div className="space-y-4">{fields.map((field) => <FieldDefinition key={field.id} field={field} disabled={pending} onUpdate={(data) => perform(() => onUpdate(field.id, data))} onCreateOption={(data) => perform(() => onCreateOption(field.id, data))} onUpdateOption={(id, data) => perform(() => onUpdateOption(field.id, id, data))} />)}</div>
  </section>;
}

function FieldDefinition({ field, disabled, onUpdate, onCreateOption, onUpdateOption }: {
  field: TProjectCustomField; disabled: boolean;
  onUpdate: (data: Partial<TProjectCustomField>) => Promise<unknown>;
  onCreateOption: (data: Partial<TCustomFieldOption>) => Promise<unknown>;
  onUpdateOption: (id: string, data: Partial<TCustomFieldOption>) => Promise<unknown>;
}) {
  const [name, setName] = useState(field.name);
  const [description, setDescription] = useState(field.description);
  const [order, setOrder] = useState(field.sort_order);
  const [optionLabel, setOptionLabel] = useState("");
  return <div className="space-y-3 rounded border border-custom-border-200 p-4">
    <div className="flex flex-wrap items-center gap-2">
      <input aria-label={`Name for ${field.name}`} className={input} value={name} onChange={(event) => setName(event.target.value)} maxLength={255} disabled={disabled} />
      <span className="text-xs text-custom-text-300">{field.type}{field.is_archived ? " · archived" : ""}</span>
      <button type="button" className={button} disabled={disabled} onClick={() => void onUpdate({ is_archived: !field.is_archived })}>{field.is_archived ? "Restore" : "Archive"}</button>
    </div>
    <textarea aria-label={`Description for ${field.name}`} className={`${input} w-full`} value={description} onChange={(event) => setDescription(event.target.value)} maxLength={2000} disabled={disabled} />
    <div className="flex items-center gap-2"><label className="text-sm">Order <input className={`${input} w-24`} type="number" min={0} value={order} onChange={(event) => setOrder(Number(event.target.value))} disabled={disabled} /></label><button type="button" className={button} disabled={disabled || !name.trim()} onClick={() => void onUpdate({ name, description, sort_order: order })}>Save definition</button></div>
    {field.type === "select" && <div className="space-y-2">
      <p className="text-sm font-medium">Options</p>
      {field.options.map((option) => <OptionDefinition key={option.id} option={option} disabled={disabled} onUpdate={(data) => onUpdateOption(option.id, data)} />)}
      <div className="flex gap-2"><input aria-label={`New option for ${field.name}`} className={input} value={optionLabel} onChange={(event) => setOptionLabel(event.target.value)} maxLength={255} /><button type="button" className={button} disabled={disabled || !optionLabel.trim() || field.options.length >= 100} onClick={() => void onCreateOption({ label: optionLabel }).then(() => setOptionLabel(""))}>Add option</button></div>
    </div>}
  </div>;
}

function OptionDefinition({ option, disabled, onUpdate }: { option: TCustomFieldOption; disabled: boolean; onUpdate: (data: Partial<TCustomFieldOption>) => Promise<unknown> }) {
  const [label, setLabel] = useState(option.label);
  const [color, setColor] = useState(option.color);
  const [order, setOrder] = useState(option.sort_order);
  return <div className="flex flex-wrap items-center gap-2">
    <input className={input} aria-label={`Option ${option.label}`} value={label} onChange={(event) => setLabel(event.target.value)} disabled={disabled} />
    <input type="color" aria-label={`Color for ${option.label}`} value={color} onChange={(event) => setColor(event.target.value)} disabled={disabled} />
    <input type="number" min={0} className={`${input} w-20`} aria-label={`Order for ${option.label}`} value={order} onChange={(event) => setOrder(Number(event.target.value))} disabled={disabled} />
    <button type="button" className={button} disabled={disabled || !label.trim()} onClick={() => void onUpdate({ label, color, sort_order: order })}>Save option</button>
    <button type="button" className={button} disabled={disabled} onClick={() => void onUpdate({ is_retired: !option.is_retired })}>{option.is_retired ? "Restore option" : "Retire option"}</button>
  </div>;
}
