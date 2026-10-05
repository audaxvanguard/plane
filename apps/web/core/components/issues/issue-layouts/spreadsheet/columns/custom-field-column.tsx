// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
import type { CustomValue, TProjectCustomField } from "@plane/types";
import { CustomFieldEditor } from "../../../custom-fields/editor";
export function CustomFieldColumn({ field, value, onSave, disabled }: { field: TProjectCustomField; value?: CustomValue; onSave: (value: CustomValue) => Promise<unknown>; disabled: boolean }) {
  return <td tabIndex={0} className="min-w-48 border-r border-subtle p-2 text-13"><CustomFieldEditor field={field} value={value} disabled={disabled || field.is_archived} onSave={onSave} /></td>;
}
