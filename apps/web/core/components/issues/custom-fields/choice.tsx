// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Popover } from "@plane/propel/popover";

type Choice = { value: string; label: string; disabled?: boolean; color?: string };
export function CustomFieldChoice({ id, label, value, choices, disabled, onChange }: {
  id: string; label: string; value: string; choices: Choice[]; disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return <Popover open={open} onOpenChange={setOpen}>
    <Popover.Button id={id} disabled={disabled} aria-label={label}
      className="flex min-h-7 max-w-full items-center gap-2 rounded-md border border-strong bg-layer-2 px-2 text-body-xs-regular text-secondary hover:bg-layer-2-hover disabled:cursor-not-allowed disabled:text-disabled">
      <span className="truncate">{choices.find((choice) => choice.value === value)?.label ?? label}</span>
      <ChevronDown className="ml-auto size-3 shrink-0 text-tertiary" />
    </Popover.Button>
    <Popover.Panel placement="bottom-start" positionerClassName="z-[110]" className="z-50 min-w-44 rounded-md border border-subtle bg-surface-1 p-1 shadow-raised-200">
      <div role="listbox" aria-label={label} className="vertical-scrollbar max-h-60 overflow-y-auto" onKeyDown={(event) => {
        const options = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
        const index = options.indexOf(document.activeElement as HTMLButtonElement);
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
          event.preventDefault();
          const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length;
          options[next]?.focus();
        }
      }}>
        {choices.map((choice) => <button key={choice.value} type="button" role="option" aria-selected={choice.value === value}
          disabled={choice.disabled} className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-body-xs-regular text-secondary hover:bg-layer-1 focus:bg-layer-1 focus:outline-none disabled:text-disabled"
          onClick={() => { onChange(choice.value); setOpen(false); }}>
          {choice.color && <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: choice.color }} />}
          <span className="flex-1 truncate">{choice.label}</span>
          {choice.value === value && <Check className="size-3 text-accent-primary" />}
        </button>)}
      </div>
    </Popover.Panel>
  </Popover>;
}
