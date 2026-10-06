// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { useState } from "react";
import { Button } from "@plane/propel/button";
import { Input } from "@plane/propel/input";
import { useTranslation } from "@plane/i18n";
import type { TCustomBuiltinColumn, TCustomViewPresentationColumn, TProjectCustomField } from "@plane/types";
import { columnKey, validateViewAlias } from "@/helpers/project-view-config";
const builtins: TCustomBuiltinColumn[] = ["name","identifier","state","priority","assignees","labels","start_date","target_date","created_at","updated_at","estimate","cycle","modules"];
export function ViewColumns({ columns, fields, onChange }: { columns: TCustomViewPresentationColumn[]; fields: TProjectCustomField[]; onChange: (columns: TCustomViewPresentationColumn[]) => void }) {
  const { t } = useTranslation(), prefix = "project_settings.custom_fields.";
  const [drafts, setDrafts] = useState<Record<string,string>>({});
  const [errors, setErrors] = useState<Record<string,boolean>>({});
  const choices: TCustomViewPresentationColumn[] = [...builtins.map((key) => ({kind:"builtin" as const,key})), ...fields.filter((f) => !f.is_archived || columns.some((c) => c.kind === "custom" && c.field_id === f.id)).map((field) => ({kind:"custom" as const,field_id:field.id}))];
  const title = (column: TCustomViewPresentationColumn) => column.kind === "builtin" ? column.key : fields.find((f) => f.id === column.field_id)?.name ?? column.field_id;
  const move = (from:number,to:number) => { if(to<0||to>=columns.length)return;const next=[...columns];const [item]=next.splice(from,1);next.splice(to,0,item);onChange(next); };
  return <section className="space-y-2" aria-label={t(prefix+"columns")}>
    {columns.map((column,index) => { const key = columnKey(column); return <div key={key} className="flex flex-wrap items-center gap-2">
      <span className="text-11">{title(column)}</span>
      <Input inputSize="xs" aria-label={`${t(prefix+"column_alias")} — ${title(column)}`} value={drafts[key] ?? column.alias ?? ""} onChange={(e) => setDrafts({...drafts,[key]:e.target.value})}/>
      <Button variant="secondary" size="sm" onClick={() => { try { const alias=validateViewAlias(drafts[key] ?? column.alias ?? ""); onChange(columns.map((c,i) => i===index ? {...c,alias} : c)); setErrors({...errors,[key]:false}); } catch { setErrors({...errors,[key]:true}); } }}>{t(prefix+"apply_alias")}</Button>
      <Button variant="secondary" size="sm" onClick={() => { const {alias,...shared}=column; onChange(columns.map((c,i) => i===index ? shared : c)); setDrafts({...drafts,[key]:""}); }}>{t(prefix+"reset_alias")}</Button>
      <Button variant="secondary" size="sm" disabled={index===0} aria-label={`${t(prefix+"move_up")} — ${title(column)}`} onClick={()=>move(index,index-1)}>↑</Button>
      <Button variant="secondary" size="sm" disabled={index===columns.length-1} aria-label={`${t(prefix+"move_down")} — ${title(column)}`} onClick={()=>move(index,index+1)}>↓</Button>
      <Button variant="secondary" size="sm" disabled={column.kind==="builtin"&&column.key==="name"} onClick={() => onChange(columns.filter((_,i)=>i!==index))}>{t(prefix+"hide_column")}</Button>
      {errors[key]&&<span role="alert" className="text-danger-primary">{t(prefix+"invalid_alias")}</span>}
    </div>; })}
    <div className="flex flex-wrap gap-2">{choices.filter((column)=>!columns.some((c)=>columnKey(c)===columnKey(column))).map((column)=><Button key={columnKey(column)} variant="secondary" size="sm" disabled={columns.length>=75} onClick={()=>onChange([...columns,column])}>+ {title(column)}</Button>)}</div>
  </section>;
}
