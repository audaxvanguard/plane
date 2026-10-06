// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
import type { IProjectView, TCustomViewPresentationColumn, TProjectCustomViewConfig, TProjectCustomViewConfigV2, TCustomBuiltinColumn, TProjectCustomField, TViewStagePresentation } from "@plane/types";
export type ViewContext = { workspaceSlug: string; projectId: string; viewId: string };
export type ViewConfiguration = Pick<IProjectView, "display_filters" | "display_properties" | "rich_filters"> & { custom_view: TProjectCustomViewConfig | Record<string, never> };
export function copyConfiguration<T>(value: T): T { return JSON.parse(JSON.stringify(value)); }
export function viewContextKey(context: ViewContext) { return JSON.stringify([context.workspaceSlug, context.projectId, context.viewId]); }
export function columnKey(column: TCustomViewPresentationColumn): string {
  return column.kind === "builtin" ? `builtin:${column.key}` : `custom:${column.field_id}`;
}
export type ViewColumnFeatures = Partial<Record<"cycle" | "modules" | "estimate", boolean>> & { legacyColumns?: TCustomBuiltinColumn[]; legacyCustomFields?: string[]; titles?: Partial<Record<TCustomBuiltinColumn, string>> };
export type TResolvedViewColumn = { key: string; kind: "builtin" | "custom"; reference: string; title: string; builtin?: TCustomBuiltinColumn; field?: TProjectCustomField; readOnly: boolean; archived: boolean };
export function validateViewAlias(value: string): string {
  const alias = value.trim();
  if (!alias || Array.from(alias).length > 255) throw new Error("Aliases require 1–255 Unicode characters.");
  return alias;
}
export function resolveViewColumns(config: TProjectCustomViewConfig | Record<string, never>, metadata: TProjectCustomField[], features: ViewColumnFeatures): TResolvedViewColumn[] {
  const configured = config.version && config.columns.length > 0;
  const columns: TCustomViewPresentationColumn[] = configured ? copyConfiguration(config.columns) : [
    ...(features.legacyColumns ?? ["state", "priority"]).map((key) => ({ kind: "builtin" as const, key })),
    ...(features.legacyCustomFields ?? []).map((field_id) => ({ kind: "custom" as const, field_id })),
  ];
  const identity = columns.find((c) => c.kind === "builtin" && c.key === "name") ?? { kind: "builtin" as const, key: "name" as const };
  const seen = new Set<string>();
  return [identity, ...columns.filter((c) => !(c.kind === "builtin" && c.key === "name"))].flatMap<TResolvedViewColumn>((column) => {
    const key = columnKey(column);
    if (seen.has(key)) throw new Error("Duplicate view column.");
    seen.add(key);
    if (column.kind === "builtin") {
      if ((column.key === "cycle" || column.key === "modules" || column.key === "estimate") && features[column.key] === false) return [];
      return [{ key, kind: column.kind, reference: column.key, builtin: column.key, title: column.alias ? validateViewAlias(column.alias) : features.titles?.[column.key] ?? column.key, readOnly: false, archived: false }];
    }
    const field = metadata.find((f) => f.id === column.field_id);
    return [{ key, kind: column.kind, reference: column.field_id, field, title: column.alias ? validateViewAlias(column.alias) : field?.name ?? column.field_id, readOnly: !field || field.is_archived, archived: !!field?.is_archived }];
  });
}
export function applyStagePresentation<T extends {id:string;name:string}>(columns:T[],stages:TViewStagePresentation|null|undefined):T[] {
  if(!stages)return columns;
  const ordered=[...columns].sort((a,b)=>{
    const ai=stages.order.indexOf(a.id),bi=stages.order.indexOf(b.id);
    return (ai<0?stages.order.length:ai)-(bi<0?stages.order.length:bi);
  });
  return ordered.filter(column=>!stages.hidden.includes(column.id)).map(column=>({...column,name:stages.aliases[column.id]??column.name}));
}
export function customStageMovePayload(field:TProjectCustomField,groupId:string) {
  if(field.is_archived)throw new Error("Archived properties are read-only.");
  if(!["select","checkbox"].includes(field.type))throw new Error("Unsupported stage source.");
  let value:string|boolean|null=null;
  if(groupId!=="unset") {
    if(field.type==="checkbox") { if(!["true","false"].includes(groupId))throw new Error("Invalid stage."); value=groupId==="true"; }
    else { const option=field.options.find(option=>option.id===groupId&&!option.is_retired);if(!option)throw new Error("Stage is unavailable.");value=option.id; }
  }
  return {custom_values:{[field.id]:value}};
}
export function emptyViewConfig(): TProjectCustomViewConfigV2 {
  return { version: 2, columns: [], conditions: [], sort: null, group_by: null, metrics: [], stages: null, count_scopes: [] };
}
export function configurationFromView(view: Partial<IProjectView>): ViewConfiguration {
  const configuration = copyConfiguration({ display_filters: view.display_filters ?? {}, display_properties: view.display_properties ?? {}, rich_filters: view.rich_filters ?? null, custom_view: view.custom_view ?? {} }) as ViewConfiguration;
  const config = configuration.custom_view;
  if (config.version) {
    if (config.group_by) configuration.display_filters.group_by = `custom_field:${config.group_by.field_id}`;
    if (config.sort) configuration.display_filters.order_by = `custom_field:${config.sort.field_id}:${config.sort.direction}`;
    if (config.version === 2 && config.stages?.source === "state") configuration.display_filters.group_by = "state";
  }
  return configuration;
}
/** One effective query projection. Never drop conditions/invalid references to broaden results. */
export function projectQueryConfig(working: ViewConfiguration): TProjectCustomViewConfig | Record<string, never> {
  const config = copyConfiguration(working.custom_view ?? {});
  if (Object.keys(config).length && config.version !== 1 && config.version !== 2) throw new Error("Unsupported view configuration.");
  const group = working.display_filters.group_by;
  const sort = working.display_filters.order_by?.match(/^custom_field:(.+):(asc|desc)$/);
  if (!config.version && !group?.startsWith("custom_field:") && !sort) return {};
  const effective = config.version ? config : emptyViewConfig();
  effective.group_by = group?.startsWith("custom_field:") ? { field_id: group.slice("custom_field:".length) } : null;
  effective.sort = sort ? { field_id: sort[1], direction: sort[2] as "asc" | "desc" } : null;
  if (effective.version === 2 && effective.stages) {
    const stages = effective.stages;
    if ((stages.source === "state" && group !== "state") || (stages.source === "custom" && stages.field_id !== effective.group_by?.field_id)) effective.stages = null;
  }
  return effective;
}
