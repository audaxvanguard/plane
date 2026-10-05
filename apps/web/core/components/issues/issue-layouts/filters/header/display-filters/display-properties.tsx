/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import { observer } from "mobx-react";
// plane constants
import { ISSUE_DISPLAY_PROPERTIES } from "@plane/constants";
// plane i18n
import { useTranslation } from "@plane/i18n";
// types
import type { IIssueDisplayProperties, TProjectCustomField } from "@plane/types";
// components
import { FilterHeader } from "../helpers/filter-header";

type Props = {
  displayProperties: IIssueDisplayProperties;
  displayPropertiesToRender: (keyof IIssueDisplayProperties)[];
  handleUpdate: (updatedDisplayProperties: Partial<IIssueDisplayProperties>) => void;
  cycleViewDisabled?: boolean;
  moduleViewDisabled?: boolean;
  isEpic?: boolean;
  customFields?: TProjectCustomField[];
};

export const FilterDisplayProperties = observer(function FilterDisplayProperties(props: Props) {
  const {
    displayProperties,
    displayPropertiesToRender,
    handleUpdate,
    cycleViewDisabled = false,
    moduleViewDisabled = false,
    isEpic = false,
    customFields = [],
  } = props;
  // hooks
  const { t } = useTranslation();
  // states
  const [previewEnabled, setPreviewEnabled] = React.useState(true);

  // Filter out "cycle" and "module" keys if cycleViewDisabled or moduleViewDisabled is true
  // Also filter out display properties that should not be rendered
  const filteredDisplayProperties = ISSUE_DISPLAY_PROPERTIES.filter((property) => {
    if (!displayPropertiesToRender.includes(property.key)) return false;
    switch (property.key) {
      case "cycle":
        return !cycleViewDisabled;
      case "modules":
        return !moduleViewDisabled;
      default:
        return true;
    }
  }).map((property) => {
    if (isEpic && property.key === "sub_issue_count") {
      return { ...property, titleTranslationKey: "issue.display.properties.work_item_count" };
    }
    return property;
  });

  return (
    <>
      <FilterHeader
        title={t("issue.display.properties.label")}
        isPreviewEnabled={previewEnabled}
        handleIsPreviewEnabled={() => setPreviewEnabled(!previewEnabled)}
      />
      {previewEnabled && (
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {customFields.filter((field) => !field.is_archived || displayProperties.custom_fields?.includes(field.id)).map((field) => (
            <button key={field.id} type="button" aria-pressed={displayProperties.custom_fields?.includes(field.id) ?? false}
              className={`rounded-sm border px-2 py-0.5 text-11 transition-all ${displayProperties.custom_fields?.includes(field.id) ? "border-accent-strong bg-accent-primary text-on-color" : "border-subtle hover:bg-layer-1"}`}
              onClick={() => handleUpdate({ custom_fields: displayProperties.custom_fields?.includes(field.id)
                ? displayProperties.custom_fields.filter((id) => id !== field.id) : [...(displayProperties.custom_fields ?? []), field.id] })}>
              {field.name}{field.is_archived ? ` (${t("project_settings.custom_fields.archived")})` : ""}
            </button>
          ))}
          {filteredDisplayProperties.map((displayProperty) => (
            <>
              <button
                key={displayProperty.key}
                type="button"
                className={`rounded-sm border px-2 py-0.5 text-11 transition-all ${
                  displayProperties?.[displayProperty.key]
                    ? "border-accent-strong bg-accent-primary text-on-color"
                    : "border-subtle hover:bg-layer-1"
                }`}
                onClick={() =>
                  handleUpdate({
                    [displayProperty.key]: !displayProperties?.[displayProperty.key],
                  })
                }
              >
                {t(displayProperty.titleTranslationKey)}
              </button>
            </>
          ))}
        </div>
      )}
    </>
  );
});
