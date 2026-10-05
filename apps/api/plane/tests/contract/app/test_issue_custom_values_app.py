# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
import pytest
from plane.db.models import Issue
from plane.app.services.custom_fields import serialize_custom_values

pytestmark = pytest.mark.django_db


def url(project, suffix=""):
    return f"/api/workspaces/{project.workspace.slug}/projects/{project.id}/issues/{suffix}"


@pytest.fixture
def no_dispatch(mocker):
    mocker.patch("plane.app.views.issue.base.issue_activity.delay")


def test_create_and_patch_values_with_omission_null(
    crm_project, crm_admin_client, currency_field, no_dispatch
):
    key = str(currency_field.id)
    created = crm_admin_client.post(
        url(crm_project),
        {"name": "CRM opportunity", "custom_values": {key: "0.10"}},
        format="json",
    )
    assert created.status_code == 201, created.data
    assert created.data.get("custom_values") == {key: "0.10"}
    issue = Issue.objects.get(name="CRM opportunity")
    assert serialize_custom_values(issue) == {key: "0.10"}
    detail_url = url(crm_project, f"{issue.id}/")
    detail = crm_admin_client.get(detail_url)
    assert detail.status_code == 200, detail.data
    assert detail.data["custom_values"] == {key: "0.10"}
    assert (
        crm_admin_client.patch(
            detail_url, {"name": "Renamed"}, format="json"
        ).status_code
        == 204
    )
    assert crm_admin_client.get(detail_url).data["custom_values"] == {key: "0.10"}
    cleared = crm_admin_client.patch(
        detail_url, {"custom_values": {key: None}}, format="json"
    )
    assert cleared.status_code == 204, cleared.data
    assert crm_admin_client.get(detail_url).data["custom_values"] == {}


def test_create_response_keeps_false_and_zero(
    crm_project, crm_admin_client, currency_field, field_factory, no_dispatch
):
    checkbox = field_factory(crm_project, "checkbox")
    values = {str(currency_field.id): "0.00", str(checkbox.id): False}
    response = crm_admin_client.post(
        url(crm_project), {"name": "Zero and false", "custom_values": values}, format="json"
    )
    assert response.status_code == 201, response.data
    assert response.data.get("custom_values") == values


def test_same_project_copy_active_values(
    crm_project, crm_admin_client, currency_field, no_dispatch
):
    key = str(currency_field.id)
    source = crm_admin_client.post(
        url(crm_project),
        {"name": "Copy source", "custom_values": {key: "10.25"}},
        format="json",
    )
    assert source.status_code == 201, source.data
    copied = crm_admin_client.post(
        url(crm_project),
        {"name": "Copied", "custom_values": {key: "10.25"}},
        format="json",
    )
    assert copied.status_code == 201, copied.data
    assert serialize_custom_values(Issue.objects.get(name="Copied")) == {key: "10.25"}


def test_invalid_create_rolls_back(
    crm_project, crm_admin_client, currency_field, no_dispatch
):
    response = crm_admin_client.post(
        url(crm_project),
        {"name": "Invalid CRM", "custom_values": {str(currency_field.id): "1.001"}},
        format="json",
    )
    assert response.status_code == 400, response.data
    assert not Issue.objects.filter(name="Invalid CRM").exists()


def test_foreign_ids_and_guest_cannot_write(
    crm_project,
    crm_admin_client,
    crm_viewer_client,
    other_project,
    field_factory,
    no_dispatch,
):
    foreign = field_factory(other_project, "text")
    bad = crm_admin_client.post(
        url(crm_project),
        {"name": "Foreign", "custom_values": {str(foreign.id): "No"}},
        format="json",
    )
    assert bad.status_code == 400, bad.data
    own = field_factory(crm_project, "text")
    guest = crm_viewer_client.post(
        url(crm_project),
        {"name": "Guest", "custom_values": {str(own.id): "No"}},
        format="json",
    )
    assert guest.status_code == 403, guest.data


def test_common_public_and_portal_serializers_do_not_expose_values(
    crm_project, currency_field, crm_admin
):
    from plane.app.serializers.issue import IssuePublicSerializer
    from plane.space.serializer.issue import IssueSerializer as PortalIssueSerializer
    from plane.app.services.custom_fields import apply_custom_values

    issue = Issue.objects.create(
        project=crm_project, workspace=crm_project.workspace, name="Public-safe"
    )
    apply_custom_values(issue, {str(currency_field.id): "100.00"}, actor=crm_admin)
    assert {"custom_values", "custom_field_values"}.isdisjoint(
        IssuePublicSerializer(issue).fields
    )
    assert {"custom_values", "custom_field_values"}.isdisjoint(
        PortalIssueSerializer(issue).fields
    )
