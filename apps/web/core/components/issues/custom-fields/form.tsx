// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { Controller, useFormContext } from "react-hook-form";
import { useTranslation } from "@plane/i18n";
import type { TIssue, TProjectCustomField } from "@plane/types";
import { normalizeCustomInput } from "../../../../helpers/custom-fields";
import { CustomFieldEditor } from "./editor";

export function IssueFormCustomFields({ fields, disabled, onChange }: {
  fields: TProjectCustomField[]; disabled?: boolean; onChange?: () => void;
}) {
  const { control, formState } = useFormContext<TIssue>();
  const { t } = useTranslation();
  const active = fields.filter((field) => !field.is_archived);
  if (!active.length) return null;
  return <div className="mt-3 space-y-2 border-t border-subtle pt-3">
    <h4 className="text-body-xs-medium text-tertiary">{t("project_settings.custom_fields.label")}</h4>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{active.map((field) => <Controller key={field.id} control={control}
      name={`custom_values.${field.id}`} defaultValue={null} rules={{ validate: (value) => {
        // An unchanged historical retired option is valid; new assignments are not.
        if (value != null && value === formState.defaultValues?.custom_values?.[field.id]) return true;
        try { normalizeCustomInput(field, value ?? ""); return true; }
        catch { return t("project_settings.custom_fields.invalid_value"); }
      } }} render={({ field: controller }) =>
        <CustomFieldEditor field={field} value={controller.value} disabled={disabled}
          onChange={(value) => { controller.onChange(value); onChange?.(); }} />
      } />)}</div>
  </div>;
}
