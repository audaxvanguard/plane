# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path


from plane.app.views import StateViewSet, IntakeStateEndpoint


urlpatterns = [
    path('workspaces/<str:slug>/projects/<uuid:project_id>/states/<uuid:pk>/replacement-preview/', StateViewSet.as_view({'get':'replacement_preview'}), name='state-replacement-preview'),
    path('workspaces/<str:slug>/projects/<uuid:project_id>/states/<uuid:pk>/replace-and-delete/', StateViewSet.as_view({'post':'replace_and_delete'}), name='state-replace-and-delete'),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/states/",
        StateViewSet.as_view({"get": "list", "post": "create"}),
        name="project-states",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/states/<uuid:pk>/",
        StateViewSet.as_view({"get": "retrieve", "patch": "partial_update", "delete": "destroy"}),
        name="project-state",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/intake-state/",
        IntakeStateEndpoint.as_view(),
        name="intake-state",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/states/<uuid:pk>/mark-default/",
        StateViewSet.as_view({"post": "mark_as_default"}),
        name="project-state",
    ),
]
