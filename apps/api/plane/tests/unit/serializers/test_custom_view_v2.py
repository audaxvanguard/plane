# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
import copy
import pytest
from rest_framework.exceptions import ValidationError
from plane.db.models import State, Issue, ProjectCustomFieldOption
from plane.app.services.custom_field_queries import validate_custom_view, apply_custom_conditions

pytestmark = pytest.mark.django_db


def config(**changes):
    return {"version": 2, "columns": [], "conditions": [], "sort": None,
            "group_by": None, "metrics": [], "stages": None, "count_scopes": [], **changes}


def custom_stages(field, **changes):
    return {"source": "custom", "field_id": str(field.id), "order": [], "hidden": [], "aliases": {}, **changes}


def test_v2_aliases_and_stage_ids_are_scoped(crm_project, field_factory):
    field = field_factory(crm_project, "select")
    option = ProjectCustomFieldOption.objects.create(field=field, label="Qualified")
    raw = config(columns=[{"kind": "builtin", "key": "name", "alias": " Opportunity "},
                          {"kind": "custom", "field_id": str(field.id), "alias": "Stage"}],
                 group_by={"field_id": str(field.id)},
                 stages=custom_stages(field, order=[str(option.id), "unset"], aliases={str(option.id): "Review"}))
    original = copy.deepcopy(raw)
    result = validate_custom_view(crm_project, raw)
    assert result["columns"][0]["alias"] == "Opportunity"
    assert result["stages"]["aliases"][str(option.id)] == "Review"
    assert raw == original


def test_v1_and_empty_unchanged(crm_project):
    assert validate_custom_view(crm_project, {}) == {}
    legacy = {"version": 1, "columns": [], "conditions": [], "sort": None, "group_by": None, "metrics": []}
    assert validate_custom_view(crm_project, legacy) == legacy
    with pytest.raises(ValidationError):
        validate_custom_view(crm_project, {**legacy, "count_scopes": []})


@pytest.mark.parametrize("alias,allowed", [("😀" * 255, True), ("😀" * 256, False), (" ", False), (None, False), (12, False)])
def test_unicode_alias_limit(crm_project, alias, allowed):
    raw = config(columns=[{"kind": "builtin", "key": "name", "alias": alias}])
    if allowed:
        assert validate_custom_view(crm_project, raw)["columns"][0]["alias"] == alias
    else:
        with pytest.raises(ValidationError):
            validate_custom_view(crm_project, raw)


def test_native_stage_references_foreign_ids_and_none(crm_project, other_project):
    state = State.objects.create(project=crm_project, name="Native")
    foreign = State.objects.create(project=other_project, name="Foreign")
    stages = {"source": "state", "order": [str(state.id), "None"], "hidden": [str(state.id)], "aliases": {str(state.id): "Review"}}
    assert validate_custom_view(crm_project, config(stages=stages))["stages"] == stages
    for key in ("order", "hidden"):
        with pytest.raises(ValidationError):
            validate_custom_view(crm_project, config(stages={**stages, key: [str(foreign.id)]}))
    with pytest.raises(ValidationError):
        validate_custom_view(crm_project, config(stages={**stages, "aliases": {str(foreign.id): "Foreign"}}))


@pytest.mark.parametrize("patch", [
    {"order": ["false", "false"]}, {"hidden": ["unset", "unset"]}, {"order": ["not-a-stage"]},
    {"aliases": {"foreign": "Label"}}, {"source": "arbitrary"}, {"order": None}, {"hidden": "false"},
    {"aliases": []}, {"aliases": {"false": " "}}, {"untrusted": "field__sql"},
])
def test_invalid_custom_stage_presentation(crm_project, field_factory, patch):
    field = field_factory(crm_project, "checkbox")
    with pytest.raises(ValidationError):
        validate_custom_view(crm_project, config(group_by={"field_id": str(field.id)}, stages=custom_stages(field, **patch)))


def test_stage_source_must_match_custom_group(crm_project, field_factory):
    first = field_factory(crm_project, "checkbox")
    second = field_factory(crm_project, "checkbox")
    for stage in (custom_stages(first), {"source": "state", "order": [], "hidden": [], "aliases": {}}):
        with pytest.raises(ValidationError):
            validate_custom_view(crm_project, config(group_by={"field_id": str(second.id)}, stages=stage))


def test_foreign_and_wrong_field_options_rejected(crm_project, other_project, field_factory):
    field = field_factory(crm_project, "select")
    other = field_factory(other_project, "select")
    option = ProjectCustomFieldOption.objects.create(field=other, label="Other")
    with pytest.raises(ValidationError):
        validate_custom_view(crm_project, config(group_by={"field_id": str(field.id)}, stages=custom_stages(field, hidden=[str(option.id)])))


def test_retired_options_stay_valid_for_readonly_presentation(crm_project, field_factory):
    field = field_factory(crm_project, "select")
    option = ProjectCustomFieldOption.objects.create(field=field, label="Retired", is_retired=True)
    raw = config(group_by={"field_id": str(field.id)}, stages=custom_stages(field, order=[str(option.id), "unset"]))
    assert validate_custom_view(crm_project, raw)["stages"]["order"] == [str(option.id), "unset"]


@pytest.mark.parametrize("scopes", [["all", "all"], ["arbitrary"], "all", [None]])
def test_invalid_count_scopes(crm_project, scopes):
    with pytest.raises(ValidationError):
        validate_custom_view(crm_project, config(count_scopes=scopes))


def test_saved_native_stage_config_requires_native_display_group(crm_project, crm_admin):
    from plane.db.models import IssueView
    from plane.app.serializers.view import IssueViewSerializer
    view = IssueView.objects.create(project=crm_project, workspace=crm_project.workspace, owned_by=crm_admin,
                                    name="Native view", display_filters={"group_by": "state"})
    raw = config(stages={"source": "state", "order": [], "hidden": [], "aliases": {}}, count_scopes=["all"])
    serializer = IssueViewSerializer(view, data={"custom_view": raw}, partial=True)
    assert serializer.is_valid(), serializer.errors
    serializer.save()
    view.refresh_from_db()
    assert view.custom_view["version"] == 2
    assert view.custom_view["count_scopes"] == ["all"]
    invalid = IssueViewSerializer(view, data={"display_filters": {"group_by": "priority"}}, partial=True)
    assert not invalid.is_valid()
    assert "custom_view" in invalid.errors


def test_canonical_duplicate_columns_rejected(crm_project, field_factory):
    field = field_factory(crm_project, "text")
    with pytest.raises(ValidationError):
        validate_custom_view(crm_project, config(columns=[{"kind": "custom", "field_id": str(field.id)},
                                                       {"kind": "custom", "field_id": str(field.id).upper()}]))


def test_presentation_never_filters_results(crm_project, field_factory):
    field = field_factory(crm_project, "checkbox")
    item = Issue.objects.create(project=crm_project, workspace=crm_project.workspace, name="Visible data")
    raw = config(group_by={"field_id": str(field.id)}, stages=custom_stages(field, hidden=["false", "true", "unset"]))
    validated = validate_custom_view(crm_project, raw)
    assert list(apply_custom_conditions(Issue.objects.filter(id=item.id), validated).values_list("id", flat=True)) == [item.id]
