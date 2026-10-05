// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { useEffect, useState } from "react";
import { useCustomFields } from "./use-custom-fields";

/** Metadata is fetched once per mounted project surface, never once per card. */
export function useProjectCustomFieldDefinitions(slug?: string, projectId?: string) {
  const store = useCustomFields();
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    setError(false);
    if (slug && projectId && !store.fields[projectId] && !store.loading[projectId]) {
      void store.fetchFields(slug, projectId).catch(() => { if (active) setError(true); });
    }
    return () => { active = false; };
  }, [store, slug, projectId]);
  return { fields: projectId ? store.getFields(projectId) : [], error };
}
