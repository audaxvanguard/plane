# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
from django.urls import path
from plane.app.views.project.custom_fields import (
    CustomFieldAggregateEndpoint,
    CustomFieldCollectionEndpoint,
    CustomFieldDetailEndpoint,
    CustomFieldOptionCollectionEndpoint,
    CustomFieldOptionDetailEndpoint,
)

ROOT = "workspaces/<str:workspace_slug>/projects/<uuid:project_id>/custom-fields/"
urlpatterns = [
    path(ROOT+'aggregates/',CustomFieldAggregateEndpoint.as_view(),name='project-custom-field-aggregates'),
    path(ROOT, CustomFieldCollectionEndpoint.as_view(), name="project-custom-fields"),
    path(
        ROOT + "<uuid:field_id>/",
        CustomFieldDetailEndpoint.as_view(),
        name="project-custom-field",
    ),
    path(
        ROOT + "<uuid:field_id>/options/",
        CustomFieldOptionCollectionEndpoint.as_view(),
        name="project-custom-field-options",
    ),
    path(
        ROOT + "<uuid:field_id>/options/<uuid:option_id>/",
        CustomFieldOptionDetailEndpoint.as_view(),
        name="project-custom-field-option",
    ),
]
