// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { Dialog, EDialogWidth } from "@plane/propel/dialog";

export function ConfirmCustomFieldProjectChange({ open, onCancel, onConfirm }: {
  open: boolean; onCancel: () => void; onConfirm: () => void;
}) {
  const { t } = useTranslation();
  const key = "project_settings.custom_fields.";
  return <Dialog open={open} onOpenChange={(next) => { if (!next) onCancel(); }}>
    <Dialog.Panel width={EDialogWidth.MD} className="p-5">
      <Dialog.Title>{t(key + "change_project")}</Dialog.Title>
      <p className="mt-3 text-body-sm-regular text-secondary">{t(key + "project_change")}</p>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" size="lg" onClick={onCancel}>{t(key + "cancel")}</Button>
        <Button size="lg" onClick={onConfirm}>{t(key + "continue")}</Button>
      </div>
    </Dialog.Panel>
  </Dialog>;
}
