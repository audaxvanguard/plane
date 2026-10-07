// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { useState } from "react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { Input } from "@plane/propel/input";
import type { TProjectCustomField, TProjectCustomViewConfigV2, TViewStagePresentation } from "@plane/types";
import { applyStagePresentation, validateViewAlias } from "@/helpers/project-view-config";
import { customGroupColumns } from "@/helpers/custom-fields";
export function ViewStages({
  config,
  fields,
  states,
  onChange,
}: {
  config: TProjectCustomViewConfigV2;
  fields: TProjectCustomField[];
  states: { id: string; name: string }[];
  onChange: (config: TProjectCustomViewConfigV2, groupBy: string) => void;
}) {
  const { t } = useTranslation(),
    key = "project_settings.custom_fields.",
    stages = config.stages;
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const setSource = (field?: TProjectCustomField) => {
    const next: TViewStagePresentation = field
      ? { source: "custom", field_id: field.id, order: [], hidden: [], aliases: {} }
      : { source: "state", order: [], hidden: [], aliases: {} };
    onChange(
      { ...config, group_by: field ? { field_id: field.id } : null, stages: next },
      field ? `custom_field:${field.id}` : "state"
    );
  };
  const field = fields.find((f) => f.id === stages?.field_id);
  const columns = stages?.source === "state" ? states : field ? customGroupColumns(field, (k) => t(key + k)) : [];
  const ordered = applyStagePresentation(columns, stages ? { ...stages, hidden: [], aliases: {} } : null);
  const change = (patch: Partial<TViewStagePresentation>) => {
    if (stages)
      onChange(
        { ...config, stages: { ...stages, ...patch } },
        stages.source === "state" ? "state" : `custom_field:${stages.field_id}`
      );
  };
  const move = (id: string, direction: number) => {
    const order = ordered.map((c) => c.id),
      from = order.indexOf(id),
      to = from + direction;
    if (to < 0 || to >= order.length) return;
    [order[from], order[to]] = [order[to], order[from]];
    change({ order });
  };
  return (
    <section className="space-y-2" aria-label={t(key + "stages")}>
      <p className="text-11 text-secondary">{t(key + "local_stages_notice")}</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => setSource()}>
          {t(key + "native_stages")}
        </Button>
        {fields
          .filter((f) => !f.is_archived && ["select", "checkbox"].includes(f.type))
          .map((f) => (
            <Button key={f.id} size="sm" variant="secondary" onClick={() => setSource(f)}>
              {f.name}
            </Button>
          ))}
      </div>
      {ordered.map((column, index) => (
        <div key={column.id} className="flex flex-wrap items-center gap-2">
          <span className="text-11">{column.name}</span>
          <Input
            inputSize="xs"
            aria-label={`${t(key + "column_alias")} ${column.name}`}
            defaultValue={stages?.aliases[column.id] ?? ""}
            onBlur={(event) => {
              const value = event.target.value;
              try {
                const aliases = { ...stages?.aliases };
                if (value.trim()) aliases[column.id] = validateViewAlias(value);
                else delete aliases[column.id];
                change({ aliases });
                setErrors({ ...errors, [column.id]: false });
              } catch {
                setErrors({ ...errors, [column.id]: true });
              }
            }}
          />
          <Button
            size="sm"
            variant="secondary"
            disabled={!index}
            aria-label={`${t(key + "move_up")} ${column.name}`}
            onClick={() => move(column.id, -1)}
          >
            ↑
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={index === ordered.length - 1}
            aria-label={`${t(key + "move_down")} ${column.name}`}
            onClick={() => move(column.id, 1)}
          >
            ↓
          </Button>
          <Button
            size="sm"
            variant="secondary"
            aria-pressed={stages?.hidden.includes(column.id)}
            onClick={() =>
              change({
                hidden: stages?.hidden.includes(column.id)
                  ? stages.hidden.filter((id) => id !== column.id)
                  : [...(stages?.hidden ?? []), column.id],
              })
            }
          >
            {t(key + (stages?.hidden.includes(column.id) ? "restore_stage" : "hide_stage"))}
          </Button>
          {errors[column.id] && <span role="alert">{t(key + "invalid_alias")}</span>}
        </div>
      ))}
      {!!stages?.hidden.length && (
        <div role="status">
          <span>
            {t(key + "hidden_stages_notice")} {stages.hidden.length}
          </span>{" "}
          <Button size="sm" variant="secondary" onClick={() => change({ hidden: [] })}>
            {t(key + "restore_all_stages")}
          </Button>
        </div>
      )}
    </section>
  );
}
