# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
import pytest
from plane.db.models import ProjectCustomField, ProjectCustomFieldOption

pytestmark = pytest.mark.django_db


def endpoint(project, suffix=""):
    return f"/api/workspaces/{project.workspace.slug}/projects/{project.id}/custom-fields/{suffix}"


@pytest.mark.parametrize(
    "kind", ["text", "number", "currency", "date", "checkbox", "select"]
)
def test_admin_creates_six_field_types(crm_project, crm_admin_client, kind):
    response = crm_admin_client.post(
        endpoint(crm_project), {"name": kind, "type": kind}, format="json"
    )
    assert response.status_code == 201, response.data
    assert response.data["type"] == kind
    assert response.data["project_id"] == str(crm_project.id)
    assert (
        crm_admin_client.get(endpoint(crm_project)).data[0]["id"] == response.data["id"]
    )


@pytest.mark.parametrize("client_name", ["crm_member_client", "crm_viewer_client"])
def test_nonadmin_cannot_change_schema(crm_project, request, client_name):
    client = request.getfixturevalue(client_name)
    assert (
        client.post(
            endpoint(crm_project), {"name": "Value", "type": "currency"}, format="json"
        ).status_code
        == 403
    )
    assert client.get(endpoint(crm_project)).status_code == 200
    field = ProjectCustomField.objects.create(
        project=crm_project, name="Protected", type="select"
    )
    url = endpoint(crm_project, f"{field.id}/")
    assert client.patch(url, {"name": "Hijacked"}, format="json").status_code == 403
    assert (
        client.post(url + "options/", {"label": "Hijacked"}, format="json").status_code
        == 403
    )


def test_names_are_normalized_and_unique(crm_project, crm_admin_client):
    first = crm_admin_client.post(
        endpoint(crm_project),
        {"name": "  Opportunity   Value  ", "type": "currency"},
        format="json",
    )
    assert first.status_code == 201
    assert first.data["name"] == "Opportunity Value"
    assert (
        crm_admin_client.post(
            endpoint(crm_project),
            {"name": "opportunity value", "type": "text"},
            format="json",
        ).status_code
        == 400
    )


def test_workspace_admin_retains_existing_project_admin_override(
    crm_project, crm_viewer_client, crm_viewer
):
    from plane.db.models import WorkspaceMember

    WorkspaceMember.objects.filter(
        workspace=crm_project.workspace, member=crm_viewer
    ).update(role=20)
    response = crm_viewer_client.post(
        endpoint(crm_project), {"name": "Admin override", "type": "text"}, format="json"
    )
    assert response.status_code == 201, response.data


def test_type_immutable_archive_restore_and_order(
    crm_project, crm_admin_client, field_factory
):
    field = field_factory(crm_project, "currency")
    url = endpoint(crm_project, f"{field.id}/")
    assert (
        crm_admin_client.patch(url, {"type": "number"}, format="json").status_code
        == 400
    )
    result = crm_admin_client.patch(
        url,
        {"is_archived": True, "sort_order": 3, "description": "Optional value"},
        format="json",
    )
    assert result.status_code == 200, result.data
    assert result.data["is_archived"] is True
    assert crm_admin_client.get(endpoint(crm_project)).data[0]["is_archived"] is True
    assert (
        crm_admin_client.patch(url, {"is_archived": False}, format="json").status_code
        == 200
    )
    assert crm_admin_client.delete(url).status_code == 405


def test_foreign_field_and_mismatched_workspace_are_not_accessible(
    crm_project, other_project, crm_admin_client, field_factory
):
    field = field_factory(other_project, "text")
    assert (
        crm_admin_client.patch(
            endpoint(crm_project, f"{field.id}/"), {"name": "Stolen"}, format="json"
        ).status_code
        == 404
    )
    assert crm_admin_client.get(endpoint(other_project)).status_code == 404
    bad = f"/api/workspaces/{other_project.workspace.slug}/projects/{crm_project.id}/custom-fields/"
    assert crm_admin_client.get(bad).status_code == 404


def test_active_field_limit_including_restore(
    crm_project, crm_admin_client, field_factory
):
    archived = field_factory(crm_project, "text", name="Archived")
    archived.is_archived = True
    archived.save()
    for number in range(50):
        field_factory(crm_project, "number", name=f"Number {number}")
    assert (
        crm_admin_client.post(
            endpoint(crm_project), {"name": "Over limit", "type": "text"}, format="json"
        ).status_code
        == 400
    )
    assert (
        crm_admin_client.patch(
            endpoint(crm_project, f"{archived.id}/"),
            {"is_archived": False},
            format="json",
        ).status_code
        == 400
    )


def test_select_options_stable_ids_retirement_and_foreign_option(
    crm_project, other_project, crm_admin_client, field_factory
):
    field = field_factory(crm_project, "select")
    url = endpoint(crm_project, f"{field.id}/options/")
    result = crm_admin_client.post(
        url, {"label": "Qualified", "color": "#12ab34"}, format="json"
    )
    assert result.status_code == 201, result.data
    option_id = result.data["id"]
    updated = crm_admin_client.patch(
        url + option_id + "/", {"label": "New label", "is_retired": True}, format="json"
    )
    assert updated.status_code == 200, updated.data
    assert updated.data["id"] == option_id
    assert updated.data["is_retired"] is True
    other = field_factory(other_project, "select")
    foreign = ProjectCustomFieldOption.objects.create(
        project=other_project, field=other, label="Other"
    )
    assert (
        crm_admin_client.patch(
            url + str(foreign.id) + "/", {"label": "Hijacked"}, format="json"
        ).status_code
        == 404
    )
    assert (
        crm_admin_client.get(endpoint(crm_project)).data[0]["options"][0]["label"]
        == "New label"
    )


def test_options_cap_counts_retired_options(
    crm_project, crm_admin_client, field_factory
):
    field = field_factory(crm_project, "select")
    for number in range(100):
        ProjectCustomFieldOption.objects.create(
            project=crm_project, field=field, label=str(number), is_retired=True
        )
    result = crm_admin_client.post(
        endpoint(crm_project, f"{field.id}/options/"), {"label": "101"}, format="json"
    )
    assert result.status_code == 400, result.data


def test_options_only_for_select_and_valid_color(
    crm_project, crm_admin_client, field_factory
):
    text = field_factory(crm_project, "text")
    assert (
        crm_admin_client.post(
            endpoint(crm_project, f"{text.id}/options/"), {"label": "No"}, format="json"
        ).status_code
        == 400
    )
    select = field_factory(crm_project, "select")
    assert (
        crm_admin_client.post(
            endpoint(crm_project, f"{select.id}/options/"),
            {"label": "Bad", "color": "url(javascript:bad)"},
            format="json",
        ).status_code
        == 400
    )


@pytest.mark.django_db(transaction=True)
def test_concurrent_creates_cannot_bypass_active_field_limit(
    crm_project, crm_admin, field_factory
):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier
    from django.db import connections, close_old_connections
    from rest_framework.test import APIClient

    for number in range(49):
        field_factory(crm_project, "text", name=f"Existing {number}")
    barrier = Barrier(2)

    def create(name):
        close_old_connections()
        try:
            client = APIClient()
            client.force_authenticate(user=crm_admin)
            barrier.wait(timeout=10)
            return client.post(
                endpoint(crm_project), {"name": name, "type": "text"}, format="json"
            ).status_code
        finally:
            connections.close_all()

    with ThreadPoolExecutor(max_workers=2) as executor:
        statuses = list(executor.map(create, ["Concurrent A", "Concurrent B"]))
    assert sorted(statuses) == [201, 400]
    assert (
        ProjectCustomField.objects.filter(
            project=crm_project, is_archived=False
        ).count()
        == 50
    )


@pytest.mark.django_db(transaction=True)
def test_concurrent_options_cannot_bypass_limit(crm_project, crm_admin, field_factory):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier
    from django.db import connections, close_old_connections
    from rest_framework.test import APIClient

    field = field_factory(crm_project, "select")
    for number in range(99):
        ProjectCustomFieldOption.objects.create(
            project=crm_project, field=field, label=str(number), is_retired=True
        )
    barrier = Barrier(2)

    def create(label):
        close_old_connections()
        try:
            client = APIClient()
            client.force_authenticate(user=crm_admin)
            barrier.wait(timeout=10)
            return client.post(
                endpoint(crm_project, f"{field.id}/options/"),
                {"label": label},
                format="json",
            ).status_code
        finally:
            connections.close_all()

    with ThreadPoolExecutor(max_workers=2) as executor:
        statuses = list(executor.map(create, ["Concurrent A", "Concurrent B"]))
    assert sorted(statuses) == [201, 400]
    assert field.options.count() == 100


def test_anonymous_cannot_read_schema(crm_project, api_client):
    assert api_client.get(endpoint(crm_project)).status_code in (401, 403)
