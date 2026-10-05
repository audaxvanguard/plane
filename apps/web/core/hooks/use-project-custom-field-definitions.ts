// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { useEffect } from "react";
import { useCustomFields } from "./use-custom-fields";

/** Shared project metadata/error state; never fetch once per card. */
export function useProjectCustomFieldDefinitions(slug?: string, projectId?: string) {
  const store = useCustomFields();
  useEffect(() => {
    if (slug && projectId && !store.fields[projectId] && !store.loading[projectId] && !store.errors[projectId]) {
      void store.fetchFields(slug, projectId).catch(() => {});
    }
  }, [store, slug, projectId]);
  const retry = async () => {
    if (slug && projectId) await store.fetchFields(slug, projectId).catch(() => {});
  };
  return {
    fields: projectId ? store.getFields(projectId) : [],
    error: projectId ? !!store.errors[projectId] : false,
    loading: projectId ? !!store.loading[projectId] : false,
    retry,
  };
}
