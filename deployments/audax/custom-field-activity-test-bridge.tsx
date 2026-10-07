// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
import React from "react";
const snapshot = (type: string, value: string | null) => JSON.stringify({ label: "Historical property", type, value });
const rows: Record<string, { old_value: string; new_value: string }> = {
  amount: { old_value: snapshot("currency", "0.00"), new_value: snapshot("currency", "9007199254740992.01") },
  text: { old_value: snapshot("text", null), new_value: snapshot("text", "<img src=x onerror=alert(1)>") },
};
export const useIssueDetail = () => ({ activity: { getActivityById: (id: string) => rows[id] } });
export function IssueActivityBlockComponent({
  activityId,
  children,
}: {
  activityId: string;
  children: React.ReactNode;
}) {
  return <div data-testid={`history-${activityId}`}>{children}</div>;
}
