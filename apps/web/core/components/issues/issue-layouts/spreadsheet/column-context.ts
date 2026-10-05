// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { createContext } from "react";
import type { TResolvedViewColumn } from "@/helpers/project-view-config";
export const SpreadsheetColumnsContext = createContext<TResolvedViewColumn[] | undefined>(undefined);
