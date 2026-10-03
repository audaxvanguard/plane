# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
import pytest
from rest_framework.exceptions import ValidationError
from plane.app.serializers.draft import DraftIssueCreateSerializer
from plane.db.models import DraftIssue, ProjectMember, WorkspaceMember

pytestmark = pytest.mark.django_db


def serializer(project, actor, data, instance=None):
    return DraftIssueCreateSerializer(
        instance,
        data=data,
        partial=instance is not None,
        context={
            "project_id": data.get("project_id", project.id if project else None),
            "workspace_id": instance.workspace_id if instance else project.workspace_id,
            "actor": actor,
            "cycle_id": "not_provided",
        },
    )


def test_draft_save_sparse_patch_and_omission(crm_project, crm_admin, currency_field):
    key = str(currency_field.id)
    create = serializer(
        crm_project, crm_admin, {"name": "Draft", "custom_values": {key: "0.10"}}
    )
    assert create.is_valid(), create.errors
    draft = create.save()
    assert draft.custom_values == {key: "0.10"}
    update = serializer(
        crm_project, crm_admin, {"name": "Renamed", "custom_values": {}}, draft
    )
    assert update.is_valid(), update.errors
    update.save()
    draft.refresh_from_db()
    assert draft.custom_values == {key: "0.10"}
    clear = serializer(crm_project, crm_admin, {"custom_values": {key: None}}, draft)
    assert clear.is_valid(), clear.errors
    clear.save()
    draft.refresh_from_db()
    assert draft.custom_values == {}


def test_project_change_confirmation_and_destination_validation(
    crm_project, crm_admin, currency_field
):
    from plane.db.models import Project

    destination = Project.objects.create(
        workspace=crm_project.workspace, name="Destination", identifier="DST"
    )
    ProjectMember.objects.create(project=destination, member=crm_admin, role=20)
    key = str(currency_field.id)
    draft = DraftIssue.objects.create(
        project=crm_project,
        workspace=crm_project.workspace,
        name="Switch",
        custom_values={key: "10.00"},
    )
    change = serializer(
        crm_project, crm_admin, {"project_id": str(destination.id)}, draft
    )
    assert change.is_valid(), change.errors
    with pytest.raises(ValidationError):
        change.save()
    draft.refresh_from_db()
    assert draft.project_id == crm_project.id and draft.custom_values == {key: "10.00"}
    confirm = serializer(
        crm_project,
        crm_admin,
        {"project_id": str(destination.id), "confirm_clear_custom_values": True},
        draft,
    )
    assert confirm.is_valid(), confirm.errors
    confirm.save()
    draft.refresh_from_db()
    assert draft.project_id == destination.id and draft.custom_values == {}


def test_draft_unassigned_requires_empty_values(crm_project, crm_admin, currency_field):
    data = {
        "project_id": None,
        "name": "Unassigned",
        "custom_values": {str(currency_field.id): "1.00"},
    }
    draft = serializer(crm_project, crm_admin, data)
    assert draft.is_valid(), draft.errors
    with pytest.raises(ValidationError):
        draft.save()
    assert not DraftIssue.objects.filter(name="Unassigned").exists()
    empty = serializer(
        crm_project,
        crm_admin,
        {"project_id": None, "name": "Empty", "custom_values": {}},
    )
    assert empty.is_valid(), empty.errors
    result = empty.save()
    assert result.project_id is None and result.custom_values == {}
