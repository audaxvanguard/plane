# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
from uuid import uuid4
import pytest
from rest_framework.test import APIClient
from plane.db.models import APIToken, Issue
from plane.app.services.custom_fields import serialize_custom_values

pytestmark = pytest.mark.django_db


@pytest.fixture
def token_client(crm_project, crm_admin, mocker):
    mocker.patch("plane.api.views.issue.issue_activity.delay")
    mocker.patch("plane.api.views.issue.model_activity.delay")
    token = APIToken.objects.create(
        user=crm_admin, label="Isolated CRM token", token=uuid4().hex
    )
    client = APIClient()
    client.credentials(HTTP_X_API_KEY=token.token)
    return client


def url(project, suffix=""):
    return f"/api/v1/workspaces/{project.workspace.slug}/projects/{project.id}/issues/{suffix}"


def test_token_create_read_patch_same_scalar_contract(
    crm_project, currency_field, token_client
):
    key = str(currency_field.id)
    response = token_client.post(
        url(crm_project),
        {"name": "Token opportunity", "custom_values": {key: "0.10"}},
        format="json",
    )
    assert response.status_code == 201, response.data
    issue = Issue.objects.get(name="Token opportunity")
    assert serialize_custom_values(issue) == {key: "0.10"}
    detail = url(crm_project, f"{issue.id}/")
    assert token_client.get(detail).data["custom_values"] == {key: "0.10"}
    updated = token_client.patch(
        detail, {"custom_values": {key: "10.25"}}, format="json"
    )
    assert updated.status_code == 200, updated.data
    assert token_client.get(detail).data["custom_values"] == {key: "10.25"}


def test_token_bad_precision_and_foreign_field_roll_back(
    crm_project, other_project, currency_field, field_factory, token_client
):
    foreign = field_factory(other_project, "currency")
    for key, value in ((str(currency_field.id), "1.001"), (str(foreign.id), "10.00")):
        response = token_client.post(
            url(crm_project),
            {"name": "Invalid token CRM", "custom_values": {key: value}},
            format="json",
        )
        assert response.status_code == 400, response.data
    assert not Issue.objects.filter(name="Invalid token CRM").exists()
