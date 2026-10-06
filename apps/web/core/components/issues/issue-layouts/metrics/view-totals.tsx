// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
import {useEffect} from "react";
import {observer} from "mobx-react";
import {useTranslation} from "@plane/i18n";
import {Button} from "@plane/propel/button";
import {useViewMetrics} from "@/hooks/use-view-metrics";
import {useViewConfiguration} from "@/hooks/use-view-configuration";
import {useCustomFields} from "@/hooks/use-custom-fields";
import {projectQueryConfig} from "@/helpers/project-view-config";
import type {ViewContext} from "@/helpers/project-view-config";
import {PipelineTotals} from "./totals";
export const ViewPipelineTotals=observer(function ViewPipelineTotals({context}:{context:ViewContext}){
  const store=useViewMetrics(),configuration=useViewConfiguration().get(context),metadata=useCustomFields();
  const {t}=useTranslation(),key="project_settings.custom_fields.";
  const effective=configuration?{custom_view:projectQueryConfig(configuration.working),rich_filters:configuration.working.rich_filters??{},display_filters:{...configuration.working.display_filters,sub_issue:configuration.working.display_filters.sub_issue??true}}:null;
  const signature=JSON.stringify(effective),invalidation=store.invalidations[context.projectId]??0;
  const enabled=!!effective&&(!!effective.custom_view.metrics?.length||(effective.custom_view.version===2&&!!effective.custom_view.count_scopes.length));
  const fetch=()=>{if(effective)void store.fetch(context,effective).catch(()=>{});};
  useEffect(()=>{if(enabled)fetch();},[signature,invalidation,context.workspaceSlug,context.projectId,context.viewId,enabled]);
  if(!enabled)return null;
  const entry=store.get(context);
  return <div className="border-b border-subtle px-4 py-2">
    {!entry||entry.signature!==signature||entry.loading?<p role="status">{t(key+"loading_totals")}</p>:entry.error?<div role="alert">{t(key+"totals_error")} <Button variant="secondary" size="sm" onClick={fetch}>{t(key+"retry")}</Button></div>:entry.data&&<PipelineTotals response={entry.data} fields={metadata.getFields(context.projectId)}/>}
  </div>;
});
