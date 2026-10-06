// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
import {useState,useRef,useEffect} from "react";
import {observer} from "mobx-react";
import {useTranslation} from "@plane/i18n";
import {Button} from "@plane/propel/button";
import {ProjectStateRoot} from "@/components/project-states";
import {useProjectState} from "@/hooks/store/use-project-state";
import {useViewMetrics} from "@/hooks/use-view-metrics";
import type {ViewContext} from "@/helpers/project-view-config";
import {StateReplacement} from "./state-replacement";
import {ViewPropertiesManager} from "./properties-manager";
export const SharedStages=observer(function SharedStages({context,canManage,onChanged}:{context:ViewContext;canManage:boolean;onChanged:()=>void}){
 const [nativeOpen,setNativeOpen]=useState(false),[customOpen,setCustomOpen]=useState(false),[source,setSource]=useState<string|null>(null);
 const pending=useRef<{resolve:()=>void;reject:(error:Error)=>void}|null>(null);
 const store=useProjectState(),metrics=useViewMetrics(),{t}=useTranslation(),key="project_settings.custom_fields.";
 const close=()=>{pending.current?.reject(new Error("Replacement cancelled"));pending.current=null;setSource(null);};
 useEffect(()=>()=>{pending.current?.reject(new Error("Stage context changed"));pending.current=null;},[context.workspaceSlug,context.projectId]);
 const changed=()=>{metrics.invalidate(context.projectId);onChanged();};
 if(!canManage)return null;
 return <div className="space-y-3"><p className="text-11 text-secondary">{t(key+"shared_stages_notice")}</p>
   <Button variant="secondary" size="sm" onClick={()=>setNativeOpen(!nativeOpen)}>{t(key+"manage_native_stages")}</Button>
   <Button variant="secondary" size="sm" onClick={()=>setCustomOpen(true)}>{t(key+"manage_custom_stages")}</Button>
   {nativeOpen&&<ProjectStateRoot workspaceSlug={context.workspaceSlug} projectId={context.projectId} onDeleteState={id=>new Promise<void>((resolve,reject)=>{pending.current={resolve,reject};setSource(id);})}/>}
   {customOpen&&<ViewPropertiesManager workspaceSlug={context.workspaceSlug} projectId={context.projectId} canManage onClose={()=>setCustomOpen(false)} onDefinitionsChanged={changed}/>}
   {source&&<StateReplacement context={context} sourceId={source} states={store.getProjectStates(context.projectId)??[]} onClose={close} onReplaced={async()=>{await store.fetchProjectStates(context.workspaceSlug,context.projectId);changed();pending.current?.resolve();pending.current=null;}}/>}
 </div>;
});
