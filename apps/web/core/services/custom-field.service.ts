// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { API_BASE_URL } from "@plane/constants";
import type {
  TProjectCustomField,
  TCustomFieldOption,
  TCustomFieldAggregates,
  TProjectCustomViewConfig,
} from "@plane/types";
import { APIService } from "./api.service";

export class CustomFieldService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }
  private endpoint(slug: string, projectId: string) {
    return `/api/workspaces/${encodeURIComponent(slug)}/projects/${projectId}/custom-fields/`;
  }
  async getFields(slug: string, projectId: string): Promise<TProjectCustomField[]> {
    return (await this.get(this.endpoint(slug, projectId))).data;
  }
  async createField(
    slug: string,
    projectId: string,
    data: Pick<TProjectCustomField, "name" | "type"> & Partial<TProjectCustomField>
  ): Promise<TProjectCustomField> {
    return (await this.post(this.endpoint(slug, projectId), data)).data;
  }
  async updateField(
    slug: string,
    projectId: string,
    fieldId: string,
    data: Partial<TProjectCustomField>
  ): Promise<TProjectCustomField> {
    return (await this.patch(`${this.endpoint(slug, projectId)}${fieldId}/`, data)).data;
  }
  async createOption(
    slug: string,
    projectId: string,
    fieldId: string,
    data: Partial<TCustomFieldOption>
  ): Promise<TCustomFieldOption> {
    return (await this.post(`${this.endpoint(slug, projectId)}${fieldId}/options/`, data)).data;
  }
  async updateOption(
    slug: string,
    projectId: string,
    fieldId: string,
    optionId: string,
    data: Partial<TCustomFieldOption>
  ): Promise<TCustomFieldOption> {
    return (await this.patch(`${this.endpoint(slug, projectId)}${fieldId}/options/${optionId}/`, data)).data;
  }
  async getAggregates(
    slug: string,
    projectId: string,
    data: {
      custom_view: TProjectCustomViewConfig | Record<string, never>;
      view_id?: string;
      filters?: object;
      rich_filters?: object;
      display_filters?: object;
    }
  ): Promise<TCustomFieldAggregates> {
    return (await this.post(`${this.endpoint(slug, projectId)}aggregates/`, data)).data;
  }
}
