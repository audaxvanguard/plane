// SPDX-License-Identifier: AGPL-3.0-only
import { observer } from "mobx-react";
import { Clock } from "lucide-react";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useUser } from "@/hooks/store/user";
import { utcScheduleToLocal } from "@/helpers/optional-issue-time";
import { IssueActivityBlockComponent } from "./helpers/activity-block";

export const IssueScheduleTimeActivity = observer(function IssueScheduleTimeActivity(props: {
  activityId: string;
  ends: "top" | "bottom" | undefined;
}) {
  const { activity: { getActivityById } } = useIssueDetail();
  const { data: user } = useUser();
  const activity = getActivityById(props.activityId);
  if (!activity) return null;
  const timeZone = user?.user_timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const label = activity.field === "start_time" ? "start time" : "end time";
  return (
    <IssueActivityBlockComponent
      icon={<Clock size={14} className="text-secondary" aria-hidden="true" />}
      activityId={props.activityId}
      ends={props.ends}
    >
      {activity.new_value ? (
        <>set the {label} to <span className="font-medium text-primary">
          {utcScheduleToLocal(activity.new_value, timeZone).replace("T", " ")} ({timeZone})
        </span>.</>
      ) : <>removed the {label}.</>}
    </IssueActivityBlockComponent>
  );
});
