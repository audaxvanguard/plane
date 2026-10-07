// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
import React from "react";
import { createRoot } from "react-dom/client";
import { IssueCustomFieldActivity } from "../../apps/web/core/components/issues/issue-detail/issue-activity/activity/actions/custom-field";
createRoot(document.getElementById("root")!).render(
  <>
    <IssueCustomFieldActivity activityId="amount" ends={undefined} />
    <IssueCustomFieldActivity activityId="text" ends={undefined} />
  </>
);
