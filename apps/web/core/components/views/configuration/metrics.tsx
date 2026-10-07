// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { TCustomMetricScope, TProjectCustomField, TProjectCustomViewConfigV2 } from "@plane/types";
const scopes: TCustomMetricScope[] = ["all", "open", "filtered"];
export function ViewMetricsConfiguration({
  config,
  fields,
  onChange,
}: {
  config: TProjectCustomViewConfigV2;
  fields: TProjectCustomField[];
  onChange: (config: TProjectCustomViewConfigV2) => void;
}) {
  const { t } = useTranslation(),
    key = "project_settings.custom_fields.";
  const toggle = (fieldId: string, scope: TCustomMetricScope) => {
    const current = config.metrics.find((m) => m.field_id === fieldId)?.scopes ?? [];
    const next = current.includes(scope) ? current.filter((s) => s !== scope) : [...current, scope];
    onChange({
      ...config,
      metrics: [
        ...config.metrics.filter((m) => m.field_id !== fieldId),
        ...(next.length ? [{ field_id: fieldId, scopes: next }] : []),
      ],
    });
  };
  return (
    <section className="space-y-2" aria-label={t(key + "totals")}>
      <p className="text-11 text-secondary">{t(key + "open_scope_explanation")}</p>
      <div className="flex flex-wrap gap-2">
        {scopes.map((scope) => (
          <Button
            key={scope}
            variant="secondary"
            size="sm"
            aria-pressed={config.count_scopes.includes(scope)}
            onClick={() =>
              onChange({
                ...config,
                count_scopes: config.count_scopes.includes(scope)
                  ? config.count_scopes.filter((s) => s !== scope)
                  : [...config.count_scopes, scope],
              })
            }
          >
            {t(key + "item_count")} — {t(key + "scope_" + scope)}
          </Button>
        ))}
      </div>
      {fields
        .filter(
          (f) =>
            ["number", "currency"].includes(f.type) &&
            (!f.is_archived || config.metrics.some((m) => m.field_id === f.id))
        )
        .map((field) => (
          <div key={field.id} className="flex flex-wrap gap-2">
            {scopes.map((scope) => (
              <Button
                key={scope}
                variant="secondary"
                size="sm"
                aria-pressed={!!config.metrics.find((m) => m.field_id === field.id)?.scopes.includes(scope)}
                onClick={() => toggle(field.id, scope)}
              >
                {field.name} — {t(key + "scope_" + scope)}
              </Button>
            ))}
          </div>
        ))}
    </section>
  );
}
