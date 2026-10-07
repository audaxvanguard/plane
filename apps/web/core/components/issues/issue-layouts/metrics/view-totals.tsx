// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { useCallback, useEffect } from "react";
import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { useViewMetrics } from "@/hooks/use-view-metrics";
import type { EffectiveMetricsConfiguration } from "@/store/project/view-metrics.store";
import { useViewConfiguration } from "@/hooks/use-view-configuration";
import { useProjectState } from "@/hooks/store/use-project-state";
import { useCustomFields } from "@/hooks/use-custom-fields";
import { projectMetricsConfiguration } from "@/helpers/project-view-config";
import type { ViewContext } from "@/helpers/project-view-config";
import { PipelineTotals } from "./totals";
export const ViewPipelineTotals = observer(function ViewPipelineTotals({ context }: { context: ViewContext }) {
  const store = useViewMetrics(),
    configuration = useViewConfiguration().get(context),
    metadata = useCustomFields();
  const { t } = useTranslation(),
    key = "project_settings.custom_fields.";
  const effective = configuration ? projectMetricsConfiguration(configuration.working) : null;
  const nativeStates = useProjectState();
  const definitions = JSON.stringify([
    metadata.getFields(context.projectId),
    nativeStates.getProjectStates(context.projectId),
  ]);
  const signature = JSON.stringify(effective),
    invalidation = store.invalidations[context.projectId] ?? 0;
  const enabled =
    !!effective &&
    (!!effective.custom_view.metrics?.length ||
      (effective.custom_view.version === 2 && !!effective.custom_view.count_scopes.length));
  const { workspaceSlug, projectId, viewId } = context;
  const fetch = useCallback(() => {
    // The signature is the exact serialized request, including decimal strings.
    // Avoid freshly projected object identities retriggering the fetch effect.
    const query = JSON.parse(signature) as EffectiveMetricsConfiguration | null;
    if (query) void store.fetch({ workspaceSlug, projectId, viewId }, query).catch(() => {});
  }, [signature, store, workspaceSlug, projectId, viewId]);
  useEffect(() => {
    if (enabled) fetch();
  }, [fetch, definitions, invalidation, enabled]);
  if (!enabled) return null;
  const entry = store.get(context);
  const config = configuration?.working.custom_view;
  const hidden = config?.version === 2 ? (config.stages?.hidden ?? []) : [];
  const hiddenItems =
    entry?.data?.counts?.groups
      .filter((g) => hidden.includes(g.key))
      .reduce((sum, g) => sum + (g.scopes.filtered?.item_count ?? 0), 0) ?? 0;
  return (
    <div className="border-b border-subtle px-4 py-2">
      {!entry || entry.signature !== signature || entry.loading ? (
        <p role="status">{t(key + "loading_totals")}</p>
      ) : entry.error ? (
        <div role="alert">
          {t(key + "totals_error")}{" "}
          <Button variant="secondary" size="sm" onClick={fetch}>
            {t(key + "retry")}
          </Button>
        </div>
      ) : (
        entry.data && (
          <PipelineTotals
            response={entry.data}
            fields={metadata.getFields(context.projectId)}
            countScopes={config?.version === 2 ? config.count_scopes : undefined}
          />
        )
      )}
      {!!hidden.length && entry?.data && !entry.loading && entry.signature === signature && (
        <p role="status" data-testid="pipeline-hidden-items">
          {t(key + "hidden_items")}: {hiddenItems}
        </p>
      )}
    </div>
  );
});
