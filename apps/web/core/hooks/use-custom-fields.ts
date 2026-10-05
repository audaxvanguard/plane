// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { useContext } from "react";
import { StoreContext } from "@/lib/store-context";
import type { CustomFieldStore } from "@/store/project/custom-field.store";

export function useCustomFields(): CustomFieldStore {
  const context = useContext(StoreContext);
  if (!context) throw new Error("useCustomFields must be used within StoreProvider");
  return context.customFields;
}
