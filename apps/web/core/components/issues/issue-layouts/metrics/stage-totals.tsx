// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { useViewMetrics } from "@/hooks/use-view-metrics";
import { useViewConfiguration } from "@/hooks/use-view-configuration";
import { useCustomFields } from "@/hooks/use-custom-fields";
import { projectMetricsConfiguration } from "@/helpers/project-view-config";
import { PipelineTotals } from "./totals";
export const PipelineStageTotals = observer(function PipelineStageTotals({ groupKey }: { groupKey: string }) {
  const params = useParams(),
    store = useViewMetrics(),
    configurations = useViewConfiguration(),
    metadata = useCustomFields();
  const workspaceSlug = params.workspaceSlug?.toString(),
    projectId = params.projectId?.toString(),
    viewId = params.viewId?.toString();
  if (!workspaceSlug || !projectId || !viewId) return null;
  const context = { workspaceSlug, projectId, viewId },
    working = configurations.get(context)?.working,
    entry = store.get(context);
  if (!working || !entry?.data || entry.loading || entry.error) return null;
  const effective = projectMetricsConfiguration(working);
  if (entry.signature !== JSON.stringify(effective)) return null;
  return (
    <PipelineTotals
      response={entry.data}
      fields={metadata.getFields(projectId)}
      groupKey={groupKey}
      countScopes={working.custom_view.version === 2 ? working.custom_view.count_scopes : undefined}
    />
  );
});
