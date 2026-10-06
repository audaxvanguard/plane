// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
import {useEffect,useRef} from "react";
import type {ReactNode} from "react";
import {draggable,dropTargetForElements} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import {combine} from "@atlaskit/pragmatic-drag-and-drop/combine";
export function DraggableViewColumn({id,context,onMove,children}:{id:string;context:symbol;onMove:(source:string,target:string)=>void;children:ReactNode}){
 const ref=useRef<HTMLDivElement>(null);
 useEffect(()=>{const element=ref.current;if(!element)return;
  return combine(draggable({element,getInitialData:()=>({viewColumn:id,context})}),dropTargetForElements({element,canDrop:({source})=>source.data.context===context&&source.data.viewColumn!==id,onDrop:({source})=>{if(typeof source.data.viewColumn==="string")onMove(source.data.viewColumn,id);}}));
 },[id,context,onMove]);
 return <div ref={ref} data-testid={`view-column-${id}`} className="flex flex-wrap items-center gap-2">{children}</div>;
}
