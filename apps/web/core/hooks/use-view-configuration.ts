// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { useContext } from "react";
import { StoreContext } from "@/lib/store-context";
export function useViewConfiguration() {
  const context = useContext(StoreContext);
  if (!context) throw new Error("useViewConfiguration requires StoreProvider");
  return context.viewConfiguration;
}
