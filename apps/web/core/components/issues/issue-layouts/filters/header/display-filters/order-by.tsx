/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useState } from "react";
import { observer } from "mobx-react";
import { ISSUE_ORDER_BY_OPTIONS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import type { TIssueOrderByOptions, TProjectCustomField } from "@plane/types";
import { CustomFieldSortOptions } from "@/components/issues/custom-fields/view-options";

// components
import { FilterHeader, FilterOption } from "@/components/issues/issue-layouts/filters";

type Props = {
  selectedOrderBy: TIssueOrderByOptions | undefined;
  handleUpdate: (val: TIssueOrderByOptions) => void;
  orderByOptions: TIssueOrderByOptions[];
  customFields?: TProjectCustomField[];
};

export const FilterOrderBy = observer(function FilterOrderBy(props: Props) {
  const { selectedOrderBy, handleUpdate, orderByOptions, customFields = [] } = props;
  // hooks
  const { t } = useTranslation();

  const [previewEnabled, setPreviewEnabled] = useState(true);

  const activeOrderBy = selectedOrderBy ?? "-created_at";

  return (
    <>
      <FilterHeader
        title={t("common.order_by.label")}
        isPreviewEnabled={previewEnabled}
        handleIsPreviewEnabled={() => setPreviewEnabled(!previewEnabled)}
      />
      {previewEnabled && (
        <div>
          <CustomFieldSortOptions fields={customFields} selected={activeOrderBy} onChange={handleUpdate} />
          {ISSUE_ORDER_BY_OPTIONS.filter((option) => orderByOptions.includes(option.key)).map((orderBy) => (
            <FilterOption
              key={orderBy?.key}
              isChecked={activeOrderBy === orderBy?.key ? true : false}
              onClick={() => handleUpdate(orderBy.key)}
              title={t(orderBy.titleTranslationKey)}
              multiple={false}
            />
          ))}
        </div>
      )}
    </>
  );
});
