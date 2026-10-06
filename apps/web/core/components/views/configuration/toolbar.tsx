// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { useState } from "react";
import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { Input } from "@plane/propel/input";
import type { ViewContext } from "@/helpers/project-view-config";
import { emptyViewConfig, projectQueryConfig } from "@/helpers/project-view-config";
import { useViewConfiguration } from "@/hooks/use-view-configuration";
import { useProjectCustomFieldDefinitions } from "@/hooks/use-project-custom-field-definitions";
import { ViewConditions } from "./conditions";
import { ViewColumns } from "./columns";
import { ViewMetricsConfiguration } from "./metrics";
export const ViewConfigurationToolbar = observer(function ViewConfigurationToolbar({ context, canSave, onApplied, onDiscard, onCopied }: { context: ViewContext; canSave: boolean; onApplied: () => void; onDiscard: () => void; onCopied: (id: string) => void }) {
  const store = useViewConfiguration(), entry = store.get(context);
  const metadata = useProjectCustomFieldDefinitions(context.workspaceSlug, context.projectId);
  const { t } = useTranslation(), key = "project_settings.custom_fields.";
  const [name, setName] = useState("");
  const [error, setError] = useState(false);
  const [copying, setCopying] = useState(false);
  const [conditionsOpen, setConditionsOpen] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [metricsOpen, setMetricsOpen] = useState(false);
  if (!entry) return null;
  const query = projectQueryConfig(entry.working);
  const config = query.version ? query : emptyViewConfig();
  const save = async () => { setError(false); try { await store.save(context); onApplied(); } catch { setError(true); } };
  const copy = async () => { setError(false); setCopying(true); try { const view = await store.saveAs(context, name); onCopied(view.id); } catch { setError(true); } finally { setCopying(false); } };
  return <div className="space-y-2 border-b border-subtle px-4 py-2">
    <div className="flex flex-wrap items-center gap-2">
      {entry.dirty && <span role="status" className="text-11 text-secondary">{t(key + "unsaved")}</span>}
      <Button variant="secondary" size="sm" disabled={!entry.dirty || !canSave || entry.saved.is_locked} loading={entry.saving} onClick={() => { void save(); }}>{t(key + "save_view")}</Button>
      <Button variant="secondary" size="sm" disabled={!entry.dirty || entry.saving} onClick={() => { store.discard(context); onDiscard(); onApplied(); }}>{t(key + "discard_view")}</Button>
      <Input inputSize="xs" aria-label={t(key + "copy_name")} value={name} onChange={(event) => setName(event.target.value)} />
      <Button variant="secondary" size="sm" disabled={!name.trim() || entry.saved.access === 0} loading={copying} onClick={() => { void copy(); }}>{t(key + "save_as")}</Button>
      <Button variant="secondary" size="sm" onClick={() => setMetricsOpen(!metricsOpen)}>{t(key + "totals")}</Button>
      <Button variant="secondary" size="sm" onClick={() => setColumnsOpen(!columnsOpen)}>{t(key + "columns")}</Button>
      <Button variant="secondary" size="sm" onClick={() => setConditionsOpen(!conditionsOpen)}>{t(key + "conditions")}</Button>
    </div>
    <p className="text-11 text-secondary">{t(key + (entry.saved.access === 0 ? "private_copy_unavailable" : "native_copy_access"))}</p>
    {(error || entry.error) && <p role="alert" className="text-11 text-danger-primary">{t(key + "view_save_error")}</p>}
    {metricsOpen && <ViewMetricsConfiguration fields={metadata.fields} config={{...emptyViewConfig(),...config,version:2}} onChange={(custom_view)=>{store.change(context,{custom_view});onApplied();}} />}
    {columnsOpen && <ViewColumns fields={metadata.fields} columns={config.columns.length ? config.columns : [{kind:"builtin",key:"name"}]} onChange={(columns) => { store.change(context,{custom_view:{...emptyViewConfig(),...config,version:2,columns}}); onApplied(); }} />}
    {conditionsOpen && <ViewConditions fields={metadata.fields} conditions={config.conditions} onChange={(conditions) => { store.change(context, { custom_view: { ...config, conditions } }); onApplied(); }} />}
  </div>;
});
