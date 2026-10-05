// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { CustomFieldService } from "@/services/custom-field.service";
import { useCustomFields } from "@/hooks/use-custom-fields";
import { useUserPermissions } from "@/hooks/store/user";
import { CustomFieldSettings } from "@/components/project/settings/custom-fields/root";
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";

function CustomFieldsPage({ params }: { params: { workspaceSlug: string; projectId: string } }) {
  const { workspaceSlug, projectId } = params;
  const store = useCustomFields();
  const service = useMemo(() => new CustomFieldService(), []);
  const { workspaceUserInfo, allowPermissions } = useUserPermissions();
  const [error, setError] = useState<string | null>(null);
  const allowed = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.PROJECT);
  useEffect(() => {
    let active = true;
    void store.fetchFields(workspaceSlug, projectId).catch(() => { if (active) setError("Could not load custom fields."); });
    return () => { active = false; };
  }, [store, workspaceSlug, projectId]);
  if (workspaceUserInfo && !allowed) return <NotAuthorizedView section="settings" isProjectView className="h-auto" />;
  const refresh = () => store.fetchFields(workspaceSlug, projectId);
  return <SettingsContentWrapper header={<h1 className="px-6 py-4 text-sm font-medium">Custom fields</h1>}>
    {error && <p role="alert">{error}</p>}
    {allowed && <CustomFieldSettings fields={store.getFields(projectId)}
      onCreate={async (data) => { await service.createField(workspaceSlug, projectId, data); await refresh(); }}
      onUpdate={async (id, data) => { await service.updateField(workspaceSlug, projectId, id, data); await refresh(); }}
      onCreateOption={async (id, data) => { await service.createOption(workspaceSlug, projectId, id, data); await refresh(); }}
      onUpdateOption={async (id, optionId, data) => { await service.updateOption(workspaceSlug, projectId, id, optionId, data); await refresh(); }} />}
  </SettingsContentWrapper>;
}
export default observer(CustomFieldsPage);
