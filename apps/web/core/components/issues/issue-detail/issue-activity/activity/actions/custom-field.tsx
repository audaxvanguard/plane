// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { observer } from "mobx-react";
import { SlidersHorizontal } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { formatCustomFieldSnapshot, parseCustomFieldSnapshot } from "@/helpers/custom-fields";
import { IssueActivityBlockComponent } from "./helpers/activity-block";

export const IssueCustomFieldActivity = observer(function IssueCustomFieldActivity(props: {
  activityId: string;
  ends: "top" | "bottom" | undefined;
}) {
  const {
    activity: { getActivityById },
  } = useIssueDetail();
  const { t } = useTranslation();
  const activity = getActivityById(props.activityId);
  if (!activity) return null;
  const key = "project_settings.custom_fields.";
  const label = (name: string) => t(key + name);
  const snapshot = parseCustomFieldSnapshot(activity.new_value) ?? parseCustomFieldSnapshot(activity.old_value);
  return (
    <IssueActivityBlockComponent
      icon={<SlidersHorizontal size={14} className="text-secondary" aria-hidden="true" />}
      activityId={props.activityId}
      ends={props.ends}
    >
      {label("activity_changed")}{" "}
      <span className="font-medium text-primary">{snapshot?.label ?? label("activity_property")}</span>{" "}
      {label("activity_from")}{" "}
      <span className="font-medium text-primary">{formatCustomFieldSnapshot(activity.old_value, label)}</span>{" "}
      {label("activity_to")}{" "}
      <span className="font-medium text-primary">{formatCustomFieldSnapshot(activity.new_value, label)}</span>.
    </IssueActivityBlockComponent>
  );
});
