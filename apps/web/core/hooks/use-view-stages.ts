// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
import {useParams} from "next/navigation";
import {useViewConfiguration} from "@/hooks/use-view-configuration";
export function useViewStages(groupBy:string|null|undefined){
 const params=useParams(),store=useViewConfiguration(),workspaceSlug=params.workspaceSlug?.toString(),projectId=params.projectId?.toString(),viewId=params.viewId?.toString();
 if(!workspaceSlug||!projectId||!viewId)return null;
 const config=store.get({workspaceSlug,projectId,viewId})?.working.custom_view;
 if(config?.version!==2||!config.stages)return null;
 const expected=config.stages.source==="state"?"state":`custom_field:${config.stages.field_id}`;
 return groupBy===expected?config.stages:null;
}
