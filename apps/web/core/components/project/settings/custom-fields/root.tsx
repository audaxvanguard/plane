// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { useRef, useState } from "react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { Input } from "@plane/propel/input";
import type { TProjectCustomField, TCustomFieldKind, TCustomFieldOption } from "@plane/types";
import { CustomFieldChoice } from "../../../issues/custom-fields/choice";

type Props = {
  fields: TProjectCustomField[];
  onCreate: (data: { name: string; type: TCustomFieldKind }) => Promise<unknown>;
  onUpdate: (id: string, data: Partial<TProjectCustomField>) => Promise<unknown>;
  onCreateOption: (fieldId: string, data: Partial<TCustomFieldOption>) => Promise<unknown>;
  onUpdateOption: (fieldId: string, optionId: string, data: Partial<TCustomFieldOption>) => Promise<unknown>;
};
const kinds: TCustomFieldKind[] = ["text", "number", "currency", "date", "checkbox", "select"];
const key = "project_settings.custom_fields.";

export function CustomFieldSettings({ fields, onCreate, onUpdate, onCreateOption, onUpdateOption }: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<TCustomFieldKind>("text");
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const perform = async (action: () => Promise<unknown>): Promise<boolean> => {
    if (busy.current) return false;
    busy.current = true; setPending(true); setError(null);
    try { await action(); return true; }
    catch { setError(t(key + "settings_error")); return false; }
    finally { busy.current = false; setPending(false); }
  };
  return <section className="space-y-6 px-6 py-5 text-primary">
    <div className="space-y-1"><h2 className="text-h5-medium">{t(key + "label")}</h2><p className="text-body-sm-regular text-tertiary">{t(key + "description")}</p></div>
    <form className="flex flex-wrap items-end gap-3 rounded-md border border-subtle bg-layer-1 p-4" onSubmit={(event) => {
      event.preventDefault();
      void perform(async () => { await onCreate({ name: name.trim(), type: kind }); setName(""); });
    }}>
      <div className="min-w-48 flex-1 space-y-1.5"><label htmlFor="custom-field-name" className="text-body-xs-medium text-secondary">{t(key + "field_name")}</label><Input id="custom-field-name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={255} disabled={pending} /></div>
      <div className="space-y-1.5"><label htmlFor="custom-field-type" className="text-body-xs-medium text-secondary">{t(key + "field_type")}</label><CustomFieldChoice id="custom-field-type" label={t(key + "field_type")} value={kind} onChange={(value) => setKind(value as TCustomFieldKind)} disabled={pending} choices={kinds.map((value) => ({ value, label: t(key + "types." + value) }))} /></div>
      <Button type="submit" size="lg" loading={pending} disabled={!name.trim() || fields.filter((field) => !field.is_archived).length >= 50}>{t(key + "create")}</Button>
    </form>
    {error && <p role="alert" className="text-body-xs-regular text-danger-primary">{error}</p>}
    {!fields.length && <div className="rounded-md border border-subtle px-6 py-10 text-center"><p className="text-body-sm-medium">{t(key + "empty")}</p><p className="mt-1 text-body-xs-regular text-tertiary">{t(key + "empty_description")}</p></div>}
    <div className="space-y-4">{fields.map((field) => <FieldDefinition key={field.id} field={field} disabled={pending}
      onUpdate={(data) => perform(() => onUpdate(field.id, data))}
      onCreateOption={(data) => perform(() => onCreateOption(field.id, data))}
      onUpdateOption={(id, data) => perform(() => onUpdateOption(field.id, id, data))} />)}</div>
  </section>;
}

function FieldDefinition({ field, disabled, onUpdate, onCreateOption, onUpdateOption }: {
  field: TProjectCustomField; disabled: boolean;
  onUpdate: (data: Partial<TProjectCustomField>) => Promise<boolean>;
  onCreateOption: (data: Partial<TCustomFieldOption>) => Promise<boolean>;
  onUpdateOption: (id: string, data: Partial<TCustomFieldOption>) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(field.name);
  const [description, setDescription] = useState(field.description);
  const [order, setOrder] = useState(field.sort_order);
  const [optionLabel, setOptionLabel] = useState("");
  return <div className="space-y-3 rounded-md border border-subtle bg-surface-1 p-4">
    <div className="flex flex-wrap items-center gap-3">
      <Input aria-label={`${t(key + "field_name")} — ${field.name}`} className="min-w-40 flex-1" value={name} onChange={(event) => setName(event.target.value)} maxLength={255} disabled={disabled} />
      <span className="rounded-sm bg-layer-2 px-2 py-1 text-caption-sm-regular text-tertiary">{t(key + "types." + field.type)}{field.is_archived ? ` · ${t(key + "archived")}` : ""}</span>
      <Button variant="ghost" size="lg" disabled={disabled} onClick={() => void onUpdate({ is_archived: !field.is_archived })}>{t(key + (field.is_archived ? "restore" : "archive"))}</Button>
    </div>
    <textarea aria-label={`${t(key + "field_description")} — ${field.name}`} placeholder={t(key + "field_description")}
      className="w-full resize-y rounded-md border border-subtle-1 bg-layer-2 px-3 py-2 text-body-xs-regular text-primary placeholder:text-tertiary focus:outline-none focus:ring-1 focus:ring-accent-strong"
      value={description} onChange={(event) => setDescription(event.target.value)} maxLength={2000} disabled={disabled} />
    <div className="flex items-center justify-between gap-3"><label className="flex items-center gap-2 text-body-xs-regular text-secondary">{t(key + "order")}<Input className="w-20" inputSize="xs" type="number" min={0} value={order} onChange={(event) => setOrder(Number(event.target.value))} disabled={disabled} /></label><Button variant="secondary" size="lg" disabled={disabled || !name.trim()} onClick={() => void onUpdate({ name, description, sort_order: order })}>{t(key + "save_definition")}</Button></div>
    {field.type === "select" && <div className="space-y-2 border-t border-subtle pt-3">
      <p className="text-body-xs-medium text-secondary">{t(key + "options")}</p>
      {field.options.map((option) => <OptionDefinition key={option.id} option={option} disabled={disabled} onUpdate={(data) => onUpdateOption(option.id, data)} />)}
      <div className="flex gap-2"><Input aria-label={`${t(key + "new_option")} — ${field.name}`} className="flex-1" inputSize="xs" value={optionLabel} onChange={(event) => setOptionLabel(event.target.value)} maxLength={255} disabled={disabled} /><Button variant="secondary" size="lg" disabled={disabled || !optionLabel.trim() || field.options.length >= 100} onClick={() => void onCreateOption({ label: optionLabel }).then((saved) => { if (saved) setOptionLabel(""); })}>{t(key + "add_option")}</Button></div>
    </div>}
  </div>;
}

function OptionDefinition({ option, disabled, onUpdate }: { option: TCustomFieldOption; disabled: boolean; onUpdate: (data: Partial<TCustomFieldOption>) => Promise<boolean> }) {
  const { t } = useTranslation();
  const [label, setLabel] = useState(option.label);
  const [color, setColor] = useState(option.color);
  const [order, setOrder] = useState(option.sort_order);
  return <div className="flex flex-wrap items-center gap-2">
    <Input inputSize="xs" className="min-w-32 flex-1" aria-label={`${t(key + "options")} — ${option.label}`} value={label} onChange={(event) => setLabel(event.target.value)} maxLength={255} disabled={disabled} />
    <Input inputSize="xs" className="h-7 w-9 p-0.5" type="color" aria-label={`${t(key + "color")} — ${option.label}`} value={color} onChange={(event) => setColor(event.target.value)} disabled={disabled} />
    <Input inputSize="xs" type="number" min={0} className="w-16" aria-label={`${t(key + "order")} — ${option.label}`} value={order} onChange={(event) => setOrder(Number(event.target.value))} disabled={disabled} />
    <Button variant="secondary" disabled={disabled || !label.trim()} onClick={() => void onUpdate({ label, color, sort_order: order })}>{t(key + "save_option")}</Button>
    <Button variant="ghost" disabled={disabled} onClick={() => void onUpdate({ is_retired: !option.is_retired })}>{t(key + (option.is_retired ? "restore_option" : "retire_option"))}</Button>
  </div>;
}
