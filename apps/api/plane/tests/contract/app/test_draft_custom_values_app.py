# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
import pytest
from plane.db.models import DraftIssue, Issue, ProjectCustomFieldOption
from plane.app.services.custom_fields import serialize_custom_values

pytestmark = pytest.mark.django_db


@pytest.fixture
def no_dispatch(mocker):
    mocker.patch("plane.app.views.workspace.draft.issue_activity.delay")


def urls(project):
    return f"/api/workspaces/{project.workspace.slug}/draft-issues/"


def test_draft_api_roundtrip_and_historical_promotion(
    crm_project, crm_admin_client, field_factory, no_dispatch
):
    field = field_factory(crm_project, "select")
    option = ProjectCustomFieldOption.objects.create(
        project=crm_project, field=field, label="Historical"
    )
    values = {str(field.id): str(option.id)}
    result = crm_admin_client.post(
        urls(crm_project),
        {
            "project_id": str(crm_project.id),
            "name": "Draft promotion",
            "custom_values": values,
        },
        format="json",
    )
    assert result.status_code == 201, result.data
    assert result.data["custom_values"] == values
    draft = DraftIssue.objects.get(name="Draft promotion")
    option.is_retired = True
    option.save()
    field.is_archived = True
    field.save()
    promotion = (
        f"/api/workspaces/{crm_project.workspace.slug}/draft-to-issue/{draft.id}/"
    )
    response = crm_admin_client.post(
        promotion,
        {"name": "Promoted historical", "custom_values": values},
        format="json",
    )
    assert response.status_code == 201, response.data
    issue = Issue.objects.get(name="Promoted historical")
    assert serialize_custom_values(issue) == values
    assert not DraftIssue.objects.filter(id=draft.id).exists()


def test_invalid_promotion_retains_draft_without_creating_item(
    crm_project, crm_admin_client, currency_field, no_dispatch
):
    values = {str(currency_field.id): "10.00"}
    result = crm_admin_client.post(
        urls(crm_project),
        {
            "project_id": str(crm_project.id),
            "name": "Keep draft",
            "custom_values": values,
        },
        format="json",
    )
    assert result.status_code == 201, result.data
    draft = DraftIssue.objects.get(name="Keep draft")
    promotion = (
        f"/api/workspaces/{crm_project.workspace.slug}/draft-to-issue/{draft.id}/"
    )
    response = crm_admin_client.post(
        promotion,
        {"name": "Must not exist", "custom_values": {str(currency_field.id): "1.001"}},
        format="json",
    )
    assert response.status_code == 400, response.data
    draft.refresh_from_db()
    assert draft.custom_values == values
    assert not Issue.objects.filter(name="Must not exist").exists()
