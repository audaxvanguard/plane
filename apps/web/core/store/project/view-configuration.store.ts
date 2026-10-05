// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { makeAutoObservable, runInAction } from "mobx";
import type { IProjectView } from "@plane/types";
import { ViewService } from "@/services/view.service";
import { configurationFromView, copyConfiguration, projectQueryConfig, viewContextKey } from "@/helpers/project-view-config";
import type { ViewConfiguration, ViewContext } from "@/helpers/project-view-config";
type Entry = { saved: IProjectView; working: ViewConfiguration; revision: number; saving: boolean; error: boolean };
export class ViewConfigurationStore {
  entries: Record<string, Entry> = {};
  private epoch = 0;
  constructor(readonly service: Pick<ViewService, "patchView" | "createView"> = new ViewService(), readonly onSaved?: (view: IProjectView, context: ViewContext) => void) {
    makeAutoObservable(this, { service: false, onSaved: false }, { autoBind: true });
  }
  get(context: ViewContext) {
    const entry = this.entries[viewContextKey(context)];
    if (!entry) return null;
    return { ...entry, saved: copyConfiguration(entry.saved), working: copyConfiguration(entry.working), dirty: JSON.stringify(entry.working) !== JSON.stringify(configurationFromView(entry.saved)) };
  }
  hydrate(context: ViewContext, saved: IProjectView) {
    if (saved.project !== context.projectId || saved.id !== context.viewId) throw new Error("View belongs to another context.");
    const key = viewContextKey(context), current = this.get(context);
    if (!current) this.entries[key] = { saved: copyConfiguration(saved), working: configurationFromView(saved), revision: 0, saving: false, error: false };
    else {
      const entry = this.entries[key];
      entry.saved = copyConfiguration(saved);
      if (!current.dirty && !entry.saving) entry.working = configurationFromView(saved);
    }
  }
  change(context: ViewContext, patch: Partial<ViewConfiguration>) {
    const entry = this.entries[viewContextKey(context)];
    if (!entry) throw new Error("View configuration is not loaded.");
    entry.working = copyConfiguration({ ...entry.working, ...patch });
    entry.revision++; entry.error = false;
  }
  discard(context: ViewContext) {
    const entry = this.entries[viewContextKey(context)];
    if (!entry) return;
    entry.working = configurationFromView(entry.saved); entry.revision++; entry.error = false;
  }
  async save(context: ViewContext): Promise<IProjectView> {
    const key = viewContextKey(context), entry = this.entries[key];
    if (!entry || entry.saving) throw new Error("View configuration is not ready.");
    if (entry.saved.is_locked) throw new Error("View is locked.");
    const revision = entry.revision, epoch = this.epoch;
    const payload = { ...copyConfiguration(entry.working), custom_view: projectQueryConfig(entry.working) };
    entry.saving = true; entry.error = false;
    try {
      const view = await this.service.patchView(context.workspaceSlug, context.projectId, context.viewId, payload);
      if (view.project !== context.projectId || view.id !== context.viewId) throw new Error("Invalid saved-view response.");
      runInAction(() => {
        if (this.epoch !== epoch || this.entries[key] !== entry) return;
        entry.saved = copyConfiguration(view);
        if (entry.revision === revision) entry.working = configurationFromView(view);
        this.onSaved?.(view, context);
      });
      return view;
    } catch (error) {
      runInAction(() => { if (this.epoch === epoch && this.entries[key] === entry) entry.error = true; });
      throw error;
    } finally {
      runInAction(() => { if (this.epoch === epoch && this.entries[key] === entry) entry.saving = false; });
    }
  }
  async saveAs(context: ViewContext, name: string): Promise<IProjectView> {
    const entry = this.entries[viewContextKey(context)];
    if (!entry || !name.trim() || name.length > 255) throw new Error("Enter a view name.");
    // Native CE creation has read-only access and defaults public: do not publish private settings.
    if (entry.saved.access === 0) throw new Error("Private views cannot be copied with the native public-create endpoint.");
    const epoch = this.epoch;
    const view = await this.service.createView(context.workspaceSlug, context.projectId, { ...copyConfiguration(entry.working), custom_view: projectQueryConfig(entry.working), name: name.trim(), access: 1 });
    if (view.project !== context.projectId) throw new Error("Invalid new-view response.");
    if (this.epoch === epoch) this.onSaved?.(view, { ...context, viewId: view.id });
    return view;
  }
  reset() { this.epoch++; this.entries = {}; }
}
