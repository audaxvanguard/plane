// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { useState } from "react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { TCustomCondition, TProjectCustomField } from "@plane/types";
import { CustomFieldChoice } from "@/components/issues/custom-fields/choice";
import { CustomFieldControl } from "@/components/issues/custom-fields/control";
import { normalizeCustomInput } from "@/helpers/custom-fields";
const presence: TCustomCondition["operator"][] = ["is_set", "is_unset"];
export function ViewConditions({
  fields,
  conditions,
  onChange,
}: {
  fields: TProjectCustomField[];
  conditions: TCustomCondition[];
  onChange: (conditions: TCustomCondition[]) => void;
}) {
  const { t } = useTranslation(),
    key = "project_settings.custom_fields.";
  const [fieldId, setFieldId] = useState("");
  const [operator, setOperator] = useState<TCustomCondition["operator"]>("eq");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState(false);
  const field = fields.find((f) => f.id === fieldId);
  const operators: TCustomCondition["operator"][] = [
    ...presence,
    "eq",
    "neq",
    ...(field?.type === "text" ? ["contains" as const, "not_contains" as const] : []),
    ...(["currency", "number", "date"].includes(field?.type ?? "")
      ? ["gt" as const, "gte" as const, "lt" as const, "lte" as const]
      : []),
  ];
  const add = () => {
    try {
      if (!field || conditions.length >= 50) throw new Error("Invalid condition.");
      let condition: TCustomCondition = { field_id: field.id, operator };
      if (!presence.includes(operator)) {
        const value = normalizeCustomInput(
          field,
          field.type === "checkbox" ? (draft === "true" ? true : draft === "false" ? false : "") : draft
        );
        if (value === null) throw new Error("Choose a comparison value.");
        condition = { ...condition, value };
      }
      onChange([...conditions, condition]);
      setDraft("");
      setError(false);
    } catch {
      setError(true);
    }
  };
  return (
    <section className="space-y-3" aria-label={t(key + "conditions")}>
      <h4 className="text-body-sm-medium">{t(key + "conditions")}</h4>
      <p className="text-11 text-secondary">{t(key + "and_conditions")}</p>
      {conditions.map((condition, index) => (
        // oxlint-disable-next-line react/no-array-index-key -- Duplicate conditions are allowed; rows contain only stateless labels and remove actions.
        <div key={index} className="flex items-center justify-between gap-2 text-11">
          <span>
            {fields.find((f) => f.id === condition.field_id)?.name ?? condition.field_id}{" "}
            {t(key + "operator_" + condition.operator)} {condition.value == null ? "" : String(condition.value)}
          </span>
          <Button variant="secondary" size="sm" onClick={() => onChange(conditions.filter((_, i) => i !== index))}>
            {t(key + "remove_condition")}
          </Button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <CustomFieldChoice
          id="view-condition-field"
          label={t(key + "condition_property")}
          value={fieldId}
          choices={fields.filter((f) => !f.is_archived).map((f) => ({ value: f.id, label: f.name }))}
          onChange={(id) => {
            setFieldId(id);
            setOperator("eq");
            setDraft("");
          }}
        />
        {field && (
          <>
            <CustomFieldChoice
              id="view-condition-operator"
              label={t(key + "condition_operator")}
              value={operator}
              choices={operators.map((op) => ({ value: op, label: t(key + "operator_" + op) }))}
              onChange={(op) => setOperator(op as TCustomCondition["operator"])}
            />
            {!presence.includes(operator) && <CustomFieldControl field={field} draft={draft} onChange={setDraft} />}
          </>
        )}
        <Button variant="secondary" size="sm" disabled={!field || conditions.length >= 50} onClick={add}>
          {t(key + "add_condition")}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-11 text-danger-primary">
          {t(key + "invalid_condition")}
        </p>
      )}
    </section>
  );
}
