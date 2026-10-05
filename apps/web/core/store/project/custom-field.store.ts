// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { makeAutoObservable, runInAction } from "mobx";
import type { TProjectCustomField } from "@plane/types";
import { CustomFieldService } from "../../services/custom-field.service";

export class CustomFieldStore {
  fields: Record<string, TProjectCustomField[]> = {};
  loading: Record<string, boolean> = {};
  errors: Record<string, boolean> = {};
  private generation: Record<string, number> = {};
  private service = new CustomFieldService();
  constructor() { makeAutoObservable(this, {}, { autoBind: true }); }
  getFields(projectId: string): TProjectCustomField[] { return this.fields[projectId] ?? []; }
  invalidateProject(projectId: string) {
    this.generation[projectId] = (this.generation[projectId] ?? 0) + 1;
    delete this.fields[projectId];
    this.loading[projectId] = false;
    delete this.errors[projectId];
  }
  async fetchFields(slug: string, projectId: string): Promise<TProjectCustomField[]> {
    const generation = (this.generation[projectId] ?? 0) + 1;
    this.generation[projectId] = generation;
    this.loading[projectId] = true;
    this.errors[projectId] = false;
    try {
      const fields = await this.service.getFields(slug, projectId);
      if (fields.some((field) => field.project_id !== projectId)) throw new Error("Custom-field metadata belongs to another project.");
      runInAction(() => { if (this.generation[projectId] === generation) this.fields[projectId] = fields; });
      return fields;
    } catch (error) {
      runInAction(() => { if (this.generation[projectId] === generation) this.errors[projectId] = true; });
      throw error;
    } finally {
      runInAction(() => { if (this.generation[projectId] === generation) this.loading[projectId] = false; });
    }
  }
}
