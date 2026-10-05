# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
import pytest
from rest_framework.exceptions import ValidationError
from plane.db.models import Issue
from plane.app.services.custom_fields import apply_custom_values
from plane.app.services.custom_field_queries import (
    validate_custom_view,
    apply_custom_conditions,
    apply_custom_sort,
)

pytestmark = pytest.mark.django_db


def config(**kwargs):
    return (
        dict(
            version=1,
            columns=[],
            conditions=[],
            sort=None,
            group_by=None,
            metrics=[],
            **kwargs,
        )
        if not kwargs
        else {**config(), **kwargs}
    )


def test_saved_config_preserves_existing_filters(
    crm_project, crm_admin_client, currency_field, mocker
):
    mocker.patch("plane.app.views.view.base.recent_visited_task.delay")
    url = (
        f"/api/workspaces/{crm_project.workspace.slug}/projects/{crm_project.id}/views/"
    )
    response = crm_admin_client.post(
        url,
        {
            "name": "CRM pipeline",
            "filters": {"priority": ["high"]},
            "custom_view": config(
                columns=[{"kind": "custom", "field_id": str(currency_field.id)}]
            ),
        },
        format="json",
    )
    assert response.status_code == 201, response.data
    assert response.data["custom_view"]["columns"][0]["field_id"] == str(
        currency_field.id
    )
    view_url = url + str(response.data["id"]) + "/"
    changed = crm_admin_client.patch(view_url, {"custom_view": config()}, format="json")
    assert changed.status_code == 200, changed.data
    assert changed.data["filters"] == {"priority": ["high"]}
    assert changed.data["query"] == response.data["query"]


def test_project_list_custom_filter_sort_and_values(
    crm_project, crm_admin_client, crm_admin, currency_field, mocker
):
    import json

    mocker.patch("plane.app.views.issue.base.recent_visited_task.delay")
    for amount in ["0.10", "10.00"]:
        item = Issue.objects.create(
            project=crm_project, workspace=crm_project.workspace, name=amount
        )
        apply_custom_values(item, {str(currency_field.id): amount}, actor=crm_admin)
    custom = config(
        conditions=[
            {"field_id": str(currency_field.id), "operator": "gt", "value": "1.00"}
        ]
    )
    url = f"/api/workspaces/{crm_project.workspace.slug}/projects/{crm_project.id}/issues/"
    response = crm_admin_client.get(url, {"custom_view": json.dumps(custom)})
    assert response.status_code == 200, response.data
    assert len(response.data["results"]) == 1
    assert response.data["results"][0]["custom_values"] == {
        str(currency_field.id): "10.00"
    }


def test_project_custom_sort_ties_use_id_not_creation_time(
    crm_project, crm_admin_client, crm_admin, currency_field, mocker, field_factory
):
    import json
    from uuid import UUID

    mocker.patch("plane.app.views.issue.base.recent_visited_task.delay")
    for identifier in [1, 2, 3]:
        item = Issue.objects.create(
            id=UUID(int=identifier),
            project=crm_project,
            workspace=crm_project.workspace,
            name="Tied",
        )
        apply_custom_values(item, {str(currency_field.id): "1.00"}, actor=crm_admin)
    url = f"/api/workspaces/{crm_project.workspace.slug}/projects/{crm_project.id}/issues/"
    for direction in ["asc", "desc"]:
        custom = config(
            sort={"field_id": str(currency_field.id), "direction": direction}
        )
        response = crm_admin_client.get(
            url, {"custom_view": json.dumps(custom), "per_page": 2}
        )
        assert response.status_code == 200, response.data
        assert [row["id"] for row in response.data["results"]] == [
            UUID(int=1),
            UUID(int=2),
        ]
    checkbox = field_factory(crm_project, "checkbox")
    custom["group_by"] = {"field_id": str(checkbox.id)}
    grouped = crm_admin_client.get(
        url, {"custom_view": json.dumps(custom), "per_page": 2}
    )
    assert grouped.status_code == 200, grouped.data
    assert [row["id"] for row in grouped.data["results"]["unset"]["results"]] == [
        UUID(int=1),
        UUID(int=2),
    ]


def test_checkbox_group_uses_existing_pagination_shape(
    crm_project, crm_admin_client, crm_admin, field_factory, mocker
):
    import json

    mocker.patch("plane.app.views.issue.base.recent_visited_task.delay")
    field = field_factory(crm_project, "checkbox")
    for flag in [False, True, None]:
        item = Issue.objects.create(
            project=crm_project, workspace=crm_project.workspace, name=str(flag)
        )
        if flag is not None:
            apply_custom_values(item, {str(field.id): flag}, actor=crm_admin)
    custom = config(group_by={"field_id": str(field.id)})
    url = f"/api/workspaces/{crm_project.workspace.slug}/projects/{crm_project.id}/issues/"
    response = crm_admin_client.get(url, {"custom_view": json.dumps(custom)})
    assert response.status_code == 200, response.data
    assert set(response.data["results"]) == {"true", "false", "unset"}
    for group in response.data["results"].values():
        assert group["total_results"] == 1
        assert len(group["results"]) == 1


@pytest.mark.parametrize(
    "patch",
    [
        {"columns": [{"kind": "builtin", "key": []}]},
        {"conditions": [{"field_id": [], "operator": "eq", "value": "x"}]},
        {"conditions": [{"field_id": "FIELD", "operator": [], "value": "x"}]},
        {"metrics": [{"field_id": "FIELD", "scopes": [["all"]]}]},
    ],
)
def test_malformed_shapes_are_validation_errors(crm_project, currency_field, patch):
    import json

    patch = json.loads(json.dumps(patch).replace("FIELD", str(currency_field.id)))
    with pytest.raises(ValidationError):
        validate_custom_view(crm_project, config(**patch))


def test_private_foreign_and_missing_views_are_not_found(
    crm_project, other_project, crm_admin, crm_member, crm_member_client, mocker
):
    from plane.db.models import IssueView
    from uuid import uuid4

    mocker.patch("plane.app.views.view.base.recent_visited_task.delay")
    private = IssueView.objects.create(
        project=crm_project, owned_by=crm_admin, name="Private CRM", access=0
    )
    foreign = IssueView.objects.create(
        project=other_project, owned_by=crm_admin, name="Foreign CRM", access=1
    )
    base = f"/api/workspaces/{crm_project.workspace.slug}/projects/{crm_project.id}/"
    for view_id in [private.id, foreign.id, uuid4()]:
        result = crm_member_client.get(base + "issues/", {"view_id": str(view_id)})
        assert result.status_code == 404, result.data
        detail = crm_member_client.get(base + f"views/{view_id}/")
        assert detail.status_code == 404, detail.data


def test_workspace_view_rejects_custom_config(crm_project, crm_admin_client):
    url = f"/api/workspaces/{crm_project.workspace.slug}/views/"
    result = crm_admin_client.post(
        url, {"name": "Invalid workspace CRM", "custom_view": config()}, format="json"
    )
    assert result.status_code == 400, result.data


def test_valid_and_legacy_config(crm_project, currency_field):
    assert validate_custom_view(crm_project, {}) == {}
    raw = config(
        columns=[{"kind": "custom", "field_id": str(currency_field.id)}],
        metrics=[
            {"field_id": str(currency_field.id), "scopes": ["all", "open", "filtered"]}
        ],
    )
    assert validate_custom_view(crm_project, raw) == raw


@pytest.mark.parametrize(
    "patch",
    [
        {"version": 3},
        {"evil": "state__project__workspace__owner__password"},
        {"columns": [{"kind": "builtin", "key": "password"}]},
        {"conditions": [{"field_id": "bad", "operator": "eq", "value": "1"}]},
        {"conditions": [{}] * 51},
        {"columns": [{"kind": "builtin", "key": "name"}] * 2},
        {"sort": {"field_id": "bad", "direction": "asc; DROP TABLE issues"}},
    ],
)
def test_invalid_config(crm_project, patch):
    with pytest.raises(ValidationError):
        validate_custom_view(crm_project, config(**patch))


def test_foreign_and_operator_injection(crm_project, other_project, field_factory):
    foreign = field_factory(other_project, "text")
    own = field_factory(crm_project, "text")
    for field, operator in (
        (foreign, "eq"),
        (own, "regex"),
        (own, "project__workspace__owner__password"),
    ):
        with pytest.raises(ValidationError):
            validate_custom_view(
                crm_project,
                config(
                    conditions=[
                        {
                            "field_id": str(field.id),
                            "operator": operator,
                            "value": "secret",
                        }
                    ]
                ),
            )


def test_decimal_and_unset_predicates_and_sort(crm_project, crm_admin, currency_field):
    ids = []
    for value in ["0.10", "10.00", None, "0.10"]:
        issue = Issue.objects.create(
            project=crm_project, workspace=crm_project.workspace, name=str(value)
        )
        if value is not None:
            apply_custom_values(issue, {str(currency_field.id): value}, actor=crm_admin)
        ids.append(issue.id)
    queryset = Issue.objects.filter(project=crm_project)
    key = str(currency_field.id)
    cfg = validate_custom_view(
        crm_project,
        config(conditions=[{"field_id": key, "operator": "gt", "value": "0.10"}]),
    )
    assert list(
        apply_custom_conditions(queryset, cfg).values_list("id", flat=True)
    ) == [ids[1]]
    for direction in ["asc", "desc"]:
        cfg = validate_custom_view(
            crm_project, config(sort={"field_id": key, "direction": direction})
        )
        ordered = list(apply_custom_sort(queryset, cfg).values_list("id", flat=True))
        assert ordered[-1] == ids[2]
        ties = sorted([ids[0], ids[3]])
        assert ordered[:2] == ties if direction == "asc" else ordered[1:3] == ties
    cfg = validate_custom_view(
        crm_project, config(conditions=[{"field_id": key, "operator": "is_unset"}])
    )
    assert list(
        apply_custom_conditions(queryset, cfg).values_list("id", flat=True)
    ) == [ids[2]]


@pytest.mark.parametrize(
    "kind,value,operator,expected",
    [
        ("text", "Mixed Case", "contains", "case"),
        ("number", "1.250001", "gte", "1.25"),
        ("date", "2026-10-03", "lt", "2026-10-04"),
        ("checkbox", False, "eq", False),
    ],
)
def test_typed_families(
    crm_project, crm_admin, field_factory, kind, value, operator, expected
):
    field = field_factory(crm_project, kind)
    item = Issue.objects.create(
        project=crm_project, workspace=crm_project.workspace, name=kind
    )
    apply_custom_values(item, {str(field.id): value}, actor=crm_admin)
    raw = config(
        conditions=[
            {"field_id": str(field.id), "operator": operator, "value": expected}
        ]
    )
    cfg = validate_custom_view(crm_project, raw)
    assert list(
        apply_custom_conditions(
            Issue.objects.filter(project=crm_project), cfg
        ).values_list("id", flat=True)
    ) == [item.id]
