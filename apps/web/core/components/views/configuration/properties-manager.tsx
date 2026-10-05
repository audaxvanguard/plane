// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { useMemo } from "react";
import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { Dialog, EDialogWidth } from "@plane/propel/dialog";
import { CustomFieldService } from "@/services/custom-field.service";
import { useCustomFields } from "@/hooks/use-custom-fields";
import { CustomFieldSettings } from "@/components/project/settings/custom-fields/root";

type Props = { workspaceSlug: string; projectId: string; canManage: boolean; onClose: () => void; onDefinitionsChanged?: () => void };
export const ViewPropertiesManager = observer(function ViewPropertiesManager({ workspaceSlug, projectId, canManage, onClose, onDefinitionsChanged }: Props) {
  const { t } = useTranslation();
  const store = useCustomFields();
  const service = useMemo(() => new CustomFieldService(), []);
  const refresh = async () => { await store.fetchFields(workspaceSlug, projectId); onDefinitionsChanged?.(); };
  if (!canManage) return null;
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
    <Dialog.Panel width={EDialogWidth.LG} className="max-h-[80vh] overflow-y-auto">
      <Dialog.Title className="sr-only">{t("project_settings.custom_fields.manage_properties")}</Dialog.Title>
      <CustomFieldSettings fields={store.getFields(projectId)}
        onCreate={async (data) => { await service.createField(workspaceSlug, projectId, data); await refresh(); }}
        onUpdate={async (id, data) => { await service.updateField(workspaceSlug, projectId, id, data); await refresh(); }}
        onCreateOption={async (id, data) => { await service.createOption(workspaceSlug, projectId, id, data); await refresh(); }}
        onUpdateOption={async (id, option, data) => { await service.updateOption(workspaceSlug, projectId, id, option, data); await refresh(); }} />
      <div className="flex justify-end px-6 pb-5"><Button variant="secondary" onClick={onClose}>{t("project_settings.custom_fields.close")}</Button></div>
    </Dialog.Panel>
  </Dialog>;
});
