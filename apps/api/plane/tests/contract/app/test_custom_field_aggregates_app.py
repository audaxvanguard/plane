# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
import pytest
from plane.db.models import Issue, State
from plane.app.services.custom_fields import apply_custom_values

pytestmark = pytest.mark.django_db


def endpoint(project):
    return f"/api/workspaces/{project.workspace.slug}/projects/{project.id}/custom-fields/aggregates/"


def cfg(field, conditions=None, group_by=None):
    return {
        "version": 1,
        "columns": [],
        "conditions": conditions or [],
        "sort": None,
        "group_by": group_by,
        "metrics": [{"field_id": str(field.id), "scopes": ["all", "open", "filtered"]}],
    }


def test_all_open_filtered_exact_sums(
    crm_project, crm_admin, crm_admin_client, currency_field
):
    for group, amount in [
        ("backlog", "100.10"),
        ("started", "200.20"),
        ("completed", "300.30"),
        ("cancelled", "400.40"),
    ]:
        state = State.objects.create(
            project=crm_project, name=f"Translated {group}", group=group
        )
        item = Issue.objects.create(
            project=crm_project,
            workspace=crm_project.workspace,
            state=state,
            name=group,
        )
        apply_custom_values(item, {str(currency_field.id): amount}, actor=crm_admin)
    response = crm_admin_client.post(
        endpoint(crm_project),
        {"custom_view": cfg(currency_field), "filters": {"state_group": ["started"]}},
        format="json",
    )
    assert response.status_code == 200, getattr(response, "data", response.content)
    scopes = response.data["metrics"][0]["scopes"]
    assert scopes["all"]["total"] == "1001.00"
    assert scopes["open"]["total"] == "300.30"
    assert scopes["filtered"]["total"] == "200.20"
    assert scopes["all"]["item_count"] == 4
    assert scopes["all"]["valued_count"] == 4
    assert scopes["all"]["missing_count"] == 0


def test_unpaginated_signed_zero_and_missing(
    crm_project, crm_admin, crm_admin_client, currency_field
):
    for number in range(101):
        item = Issue.objects.create(
            project=crm_project, workspace=crm_project.workspace, name=str(number)
        )
        apply_custom_values(item, {str(currency_field.id): "0.10"}, actor=crm_admin)
    for amount in ["-10.00", "0.00", None]:
        item = Issue.objects.create(
            project=crm_project, workspace=crm_project.workspace, name=str(amount)
        )
        if amount is not None:
            apply_custom_values(item, {str(currency_field.id): amount}, actor=crm_admin)
    result = crm_admin_client.post(
        endpoint(crm_project),
        {"custom_view": cfg(currency_field), "per_page": 30},
        format="json",
    )
    assert result.status_code == 200, getattr(result, "data", result.content)
    scope = result.data["metrics"][0]["scopes"]["all"]
    assert scope == {
        "total": "0.10",
        "item_count": 104,
        "valued_count": 103,
        "missing_count": 1,
    }


def test_foreign_and_nonnumeric_metrics_rejected(
    crm_project, other_project, crm_admin_client, field_factory
):
    for field in [
        field_factory(other_project, "currency"),
        field_factory(crm_project, "checkbox"),
    ]:
        result = crm_admin_client.post(
            endpoint(crm_project), {"custom_view": cfg(field)}, format="json"
        )
        assert result.status_code == 400, getattr(result, "data", result.content)


def test_excludes_archived_draft_deleted_and_optional_children(
    crm_project, crm_admin, crm_admin_client, currency_field
):
    from django.utils import timezone

    parent = Issue.objects.create(
        project=crm_project, workspace=crm_project.workspace, name="Parent"
    )
    for name, attributes in [
        ("active", {}),
        ("archived", {"archived_at": timezone.now()}),
        ("draft", {"is_draft": True}),
        ("deleted", {"deleted_at": timezone.now()}),
        ("child", {"parent": parent}),
    ]:
        item = Issue.objects.create(
            project=crm_project, workspace=crm_project.workspace, name=name
        )
        apply_custom_values(item, {str(currency_field.id): "10.00"}, actor=crm_admin)
        Issue.objects.filter(id=item.id).update(**attributes)
    for include, total in [(False, "10.00"), (True, "20.00")]:
        response = crm_admin_client.post(
            endpoint(crm_project),
            {
                "custom_view": cfg(currency_field),
                "display_filters": {"sub_issue": include},
            },
            format="json",
        )
        assert response.status_code == 200, response.data
        assert response.data["metrics"][0]["scopes"]["all"]["total"] == total


def test_guest_totals_follow_item_visibility(
    crm_project, crm_admin, crm_viewer, crm_viewer_client, currency_field
):
    crm_project.guest_view_all_features = False
    crm_project.save()
    for creator in [crm_admin, crm_viewer]:
        item = Issue.objects.create(
            project=crm_project, workspace=crm_project.workspace, name="Visibility"
        )
        Issue.objects.filter(id=item.id).update(created_by=creator)
        apply_custom_values(item, {str(currency_field.id): "10.00"}, actor=crm_admin)
    result = crm_viewer_client.post(
        endpoint(crm_project), {"custom_view": cfg(currency_field)}, format="json"
    )
    assert result.status_code == 200, result.data
    assert result.data["metrics"][0]["scopes"]["all"]["total"] == "10.00"


def test_number_precision_and_grouped_checkbox_totals(
    crm_project, crm_admin, crm_admin_client, field_factory
):
    number = field_factory(crm_project, "number")
    checkbox = field_factory(crm_project, "checkbox")
    for flag in [True, False, None]:
        item = Issue.objects.create(
            project=crm_project, workspace=crm_project.workspace, name=str(flag)
        )
        values = {str(number.id): "0.000001"}
        if flag is not None:
            values[str(checkbox.id)] = flag
        apply_custom_values(item, values, actor=crm_admin)
    result = crm_admin_client.post(
        endpoint(crm_project),
        {"custom_view": cfg(number, group_by={"field_id": str(checkbox.id)})},
        format="json",
    )
    assert result.status_code == 200, result.data
    metric = result.data["metrics"][0]
    assert metric["scopes"]["all"]["total"] == "0.000003"
    assert {group["key"] for group in metric["groups"]} == {"true", "false", "unset"}
    assert all(
        group["scopes"]["all"]["total"] == "0.000001" for group in metric["groups"]
    )


def test_overlapping_label_groups_do_not_multiply_overall(
    crm_project, crm_admin, crm_admin_client, currency_field
):
    from plane.db.models import Label, IssueLabel

    item = Issue.objects.create(
        project=crm_project, workspace=crm_project.workspace, name="Overlapping"
    )
    apply_custom_values(item, {str(currency_field.id): "10.00"}, actor=crm_admin)
    for name in ["A", "B"]:
        label = Label.objects.create(project=crm_project, name=name)
        IssueLabel.objects.create(project=crm_project, issue=item, label=label)
    response = crm_admin_client.post(
        endpoint(crm_project),
        {"custom_view": cfg(currency_field), "display_filters": {"group_by": "labels"}},
        format="json",
    )
    assert response.status_code == 200, response.data
    metric = response.data["metrics"][0]
    assert metric["scopes"]["all"]["total"] == "10.00"
    assert len(metric["groups"]) == 3
    assert [
        group["scopes"]["all"]["total"]
        for group in metric["groups"]
        if group["key"] != "unset"
    ] == ["10.00", "10.00"]
    assert response.data["groups_may_overlap"] is True


def test_count_only_empty_and_hidden_stages(crm_project, crm_admin, crm_admin_client, field_factory):
    field = field_factory(crm_project, "checkbox")
    raw = {"version": 2, "group_by": {"field_id": str(field.id)}, "count_scopes": ["all", "open", "filtered"],
           "stages": {"source": "custom", "field_id": str(field.id), "order": [], "hidden": ["false", "true", "unset"], "aliases": {}}}
    response = crm_admin_client.post(endpoint(crm_project), {"custom_view": raw}, format="json")
    assert response.status_code == 200, response.data
    assert response.data["counts"]["scopes"]["all"]["item_count"] == 0
    assert {group["key"] for group in response.data["counts"]["groups"]} == {"false", "true", "unset"}
    for flag in (False, True, None):
        item = Issue.objects.create(project=crm_project, workspace=crm_project.workspace, name=str(flag))
        if flag is not None:
            apply_custom_values(item, {str(field.id): flag}, actor=crm_admin)
    response = crm_admin_client.post(endpoint(crm_project), {"custom_view": raw}, format="json")
    assert response.status_code == 200, response.data
    assert response.data["counts"]["scopes"]["filtered"]["item_count"] == 3
    assert all(group["scopes"]["all"]["item_count"] == 1 for group in response.data["counts"]["groups"])


def test_native_hidden_stage_sum_and_count_match(crm_project, crm_admin, crm_admin_client, currency_field):
    state = State.objects.create(project=crm_project, name="Active", group="started")
    for state_value, value in ((state, "0.10"), (None, "-0.05")):
        item = Issue.objects.create(project=crm_project, workspace=crm_project.workspace, state=state_value, name="Count")
        if state_value is None:
            # Issue.save assigns defaults; exercise a historical unassigned row.
            Issue.objects.filter(id=item.id).update(state=None)
        apply_custom_values(item, {str(currency_field.id): value}, actor=crm_admin)
    raw = {**cfg(currency_field), "version": 2, "count_scopes": ["all"],
           "stages": {"source": "state", "order": [str(state.id), "None"], "hidden": [str(state.id)], "aliases": {}}}
    response = crm_admin_client.post(endpoint(crm_project), {"custom_view": raw, "display_filters": {"group_by": "state"}}, format="json")
    assert response.status_code == 200, response.data
    assert response.data["metrics"][0]["scopes"]["all"]["total"] == "0.05"
    assert response.data["counts"]["scopes"]["all"]["item_count"] == 2
    groups = {group["key"]: group for group in response.data["counts"]["groups"]}
    assert groups[str(state.id)]["scopes"]["all"]["item_count"] == 1
    assert groups["None"]["scopes"]["all"]["item_count"] == 1
    invalid = crm_admin_client.post(endpoint(crm_project), {"custom_view": raw, "display_filters": {"group_by": "priority"}}, format="json")
    assert invalid.status_code == 400, invalid.data


def test_very_large_exact_totals(
    crm_project, crm_admin, crm_admin_client, currency_field
):
    for number in range(3):
        item = Issue.objects.create(
            project=crm_project, workspace=crm_project.workspace, name=str(number)
        )
        apply_custom_values(
            item, {str(currency_field.id): "9999999999999999.99"}, actor=crm_admin
        )
    result = crm_admin_client.post(
        endpoint(crm_project), {"custom_view": cfg(currency_field)}, format="json"
    )
    assert result.status_code == 200, getattr(result, "data", result.content)
    assert result.data["metrics"][0]["scopes"]["all"]["total"] == "29999999999999999.97"
