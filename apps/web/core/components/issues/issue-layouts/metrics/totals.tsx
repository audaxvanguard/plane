// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { useTranslation } from "@plane/i18n";
import type { TCustomFieldAggregates, TProjectCustomField, TCustomMetricScope } from "@plane/types";
import { formatBRL } from "@/helpers/custom-fields";
export function PipelineTotals({
  response,
  fields,
  groupKey,
  countScopes,
}: {
  response: TCustomFieldAggregates;
  fields: TProjectCustomField[];
  groupKey?: string;
  countScopes?: TCustomMetricScope[];
}) {
  const { t } = useTranslation(),
    key = "project_settings.custom_fields.";
  const counts =
    groupKey === undefined ? response.counts?.scopes : response.counts?.groups.find((g) => g.key === groupKey)?.scopes;
  return (
    <div className="flex flex-wrap items-center gap-3 text-11 text-secondary">
      {response.metrics.map((metric) => {
        const scopes =
          groupKey === undefined ? metric.scopes : metric.groups.find((group) => group.key === groupKey)?.scopes;
        return Object.entries(scopes ?? {}).map(
          ([scope, value]) =>
            value && (
              <div
                key={`${metric.field_id}:${scope}`}
                data-testid={
                  groupKey === undefined
                    ? `pipeline-total-${metric.field_id}-${scope}`
                    : `pipeline-stage-total-${groupKey}-${metric.field_id}-${scope}`
                }
              >
                <span>
                  {fields.find((f) => f.id === metric.field_id)?.name ?? metric.field_id} · {t(key + "scope_" + scope)}
                  :{" "}
                </span>
                <strong>{metric.type === "currency" ? formatBRL(value.total) : value.total.replace(".", ",")}</strong>
                <span className="ml-1 text-placeholder">
                  ({value.item_count}; {t(key + "missing_values")}: {value.missing_count})
                </span>
              </div>
            )
        );
      })}
      {Object.entries(counts ?? {})
        .filter(([scope]) => !countScopes || countScopes.includes(scope as TCustomMetricScope))
        .map(
          ([scope, value]) =>
            value && (
              <div
                key={scope}
                data-testid={
                  groupKey === undefined ? `pipeline-count-${scope}` : `pipeline-stage-count-${groupKey}-${scope}`
                }
              >
                {t(key + "item_count")} · {t(key + "scope_" + scope)}: <strong>{value.item_count}</strong>
              </div>
            )
        )}
      {response.groups_may_overlap && groupKey === undefined && (
        <p role="alert" className="w-full text-placeholder">
          {t(key + "overlap_warning")}
        </p>
      )}
    </div>
  );
}
