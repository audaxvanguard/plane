// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
import type { IProjectView, TCustomViewPresentationColumn, TProjectCustomViewConfig, TProjectCustomViewConfigV2 } from "@plane/types";
export type ViewContext = { workspaceSlug: string; projectId: string; viewId: string };
export type ViewConfiguration = Pick<IProjectView, "display_filters" | "display_properties" | "rich_filters"> & { custom_view: TProjectCustomViewConfig | Record<string, never> };
export function copyConfiguration<T>(value: T): T { return JSON.parse(JSON.stringify(value)); }
export function viewContextKey(context: ViewContext) { return JSON.stringify([context.workspaceSlug, context.projectId, context.viewId]); }
export function columnKey(column: TCustomViewPresentationColumn): string {
  return column.kind === "builtin" ? `builtin:${column.key}` : `custom:${column.field_id}`;
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
