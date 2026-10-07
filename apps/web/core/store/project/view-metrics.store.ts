// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { makeAutoObservable, runInAction } from "mobx";
import type { TCustomFieldAggregates, TProjectCustomViewConfig } from "@plane/types";
import { CustomFieldService } from "../../services/custom-field.service";
import type { ViewContext } from "../../../helpers/project-view-config";
import { viewContextKey } from "../../../helpers/project-view-config";
export type EffectiveMetricsConfiguration = {
  custom_view: TProjectCustomViewConfig | Record<string, never>;
  rich_filters?: object;
  display_filters?: object;
};
type Entry = {
  projectId: string;
  generation: number;
  loading: boolean;
  error: boolean;
  signature: string;
  data?: TCustomFieldAggregates;
};
export class ViewMetricsStore {
  entries: Record<string, Entry> = {};
  invalidations: Record<string, number> = {};
  private sequence = 0;
  readonly service = new CustomFieldService();
  constructor() {
    makeAutoObservable(this, { service: false }, { autoBind: true });
  }
  get(context: ViewContext) {
    return this.entries[viewContextKey(context)] ?? null;
  }
  async fetch(context: ViewContext, effective: EffectiveMetricsConfiguration): Promise<void> {
    const key = viewContextKey(context),
      generation = ++this.sequence;
    this.entries[key] = {
      projectId: context.projectId,
      generation,
      loading: true,
      error: false,
      signature: JSON.stringify(effective),
    };
    try {
      const data = await this.service.getAggregates(context.workspaceSlug, context.projectId, {
        ...effective,
        view_id: context.viewId,
      });
      runInAction(() => {
        if (this.entries[key]?.generation === generation) {
          this.entries[key].data = data;
          this.entries[key].loading = false;
        }
      });
    } catch (error) {
      runInAction(() => {
        if (this.entries[key]?.generation === generation) {
          this.entries[key].error = true;
          this.entries[key].loading = false;
        }
      });
      throw error;
    }
  }
  invalidate(projectId: string) {
    this.invalidations[projectId] = (this.invalidations[projectId] ?? 0) + 1;
    for (const key of Object.keys(this.entries))
      if (this.entries[key].projectId === projectId) delete this.entries[key];
  }
  reset() {
    this.sequence++;
    this.entries = {};
    this.invalidations = {};
  }
}
