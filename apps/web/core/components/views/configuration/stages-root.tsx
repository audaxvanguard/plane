// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { TProjectCustomField, TProjectCustomViewConfigV2 } from "@plane/types";
import type { ViewContext } from "@/helpers/project-view-config";
import { useProjectState } from "@/hooks/store/use-project-state";
import { ViewStages } from "./stages";
import { SharedStages } from "./shared-stages";
export const ViewStagesRoot = observer(function ViewStagesRoot({
  context,
  canManage,
  onChanged,
  ...props
}: {
  context: ViewContext;
  canManage: boolean;
  onChanged: () => void;
  config: TProjectCustomViewConfigV2;
  fields: TProjectCustomField[];
  onChange: (config: TProjectCustomViewConfigV2, groupBy: string) => void;
}) {
  const store = useProjectState(),
    { t } = useTranslation(),
    key = "project_settings.custom_fields.";
  const [error, setError] = useState(false),
    [loading, setLoading] = useState(true);
  const fetch = () => {
    setLoading(true);
    setError(false);
    void store
      .fetchProjectStates(context.workspaceSlug, context.projectId)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };
  useEffect(fetch, [context.workspaceSlug, context.projectId, store]);
  return loading ? (
    <p role="status">{t(key + "loading_properties")}</p>
  ) : error ? (
    <div role="alert">
      {t(key + "load_error")}
      <Button size="sm" variant="secondary" onClick={fetch}>
        {t(key + "retry")}
      </Button>
    </div>
  ) : (
    <div className="space-y-3">
      <ViewStages {...props} states={store.getProjectStates(context.projectId) ?? []} />
      <SharedStages context={context} canManage={canManage} onChanged={onChanged} />
    </div>
  );
});
