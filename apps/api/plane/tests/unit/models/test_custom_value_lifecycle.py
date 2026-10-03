# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
import pytest
from rest_framework.exceptions import ValidationError, PermissionDenied
from plane.db.models import Issue, ProjectCustomFieldOption, IssueCustomFieldValue
from plane.app.services.custom_fields import (
    apply_custom_values,
    serialize_custom_values,
    clear_project_values,
    validate_draft_values,
    promote_draft_values,
)

pytestmark = pytest.mark.django_db


@pytest.fixture
def item(crm_project):
    return Issue.objects.create(
        project=crm_project, workspace=crm_project.workspace, name="Opportunity"
    )


def test_set_patch_omit_null_false_and_decimal(item, crm_admin, field_factory):
    amount = field_factory(item.project, "currency")
    flag = field_factory(item.project, "checkbox")
    changes = apply_custom_values(
        item, {str(amount.id): "0.10", str(flag.id): False}, actor=crm_admin
    )
    assert len(changes) == 2
    assert serialize_custom_values(item) == {
        str(amount.id): "0.10",
        str(flag.id): False,
    }
    assert apply_custom_values(item, {}, actor=crm_admin) == []
    apply_custom_values(item, {str(amount.id): None}, actor=crm_admin)
    assert serialize_custom_values(item) == {str(flag.id): False}
    apply_custom_values(item, {str(amount.id): "1.25"}, actor=crm_admin)
    assert serialize_custom_values(item)[str(amount.id)] == "1.25"
    assert IssueCustomFieldValue.objects.filter(issue=item).count() == 2


def test_invalid_patch_is_atomic_and_tenant_scoped(
    item, crm_admin, other_project, field_factory
):
    amount = field_factory(item.project, "currency")
    text = field_factory(item.project, "text")
    with pytest.raises(ValidationError):
        apply_custom_values(
            item,
            {str(text.id): "Must roll back", str(amount.id): "1.001"},
            actor=crm_admin,
        )
    assert serialize_custom_values(item) == {}
    foreign = field_factory(other_project, "currency")
    with pytest.raises(ValidationError):
        apply_custom_values(item, {str(foreign.id): "1.00"}, actor=crm_admin)
    assert serialize_custom_values(item) == {}


def test_list_representation_batches_values(
    crm_project, crm_admin, field_factory, django_assert_num_queries
):
    from plane.app.serializers.issue import IssueSerializer

    field = field_factory(crm_project, "currency")
    for number in range(8):
        issue = Issue.objects.create(
            project=crm_project, workspace=crm_project.workspace, name=str(number)
        )
        apply_custom_values(issue, {str(field.id): "0.10"}, actor=crm_admin)
    with django_assert_num_queries(2):
        rows = IssueSerializer(
            Issue.objects.filter(project=crm_project),
            many=True,
            fields=["id", "custom_values"],
        ).data
    assert len(rows) == 8
    assert all(row["custom_values"] == {str(field.id): "0.10"} for row in rows)


def test_viewer_cannot_write(item, crm_viewer, field_factory):
    text = field_factory(item.project, "text")
    with pytest.raises(PermissionDenied):
        apply_custom_values(item, {str(text.id): "No"}, actor=crm_viewer)
    assert serialize_custom_values(item) == {}


def test_retired_option_unchanged_and_archived_field_readonly(
    item, crm_admin, field_factory
):
    select = field_factory(item.project, "select")
    option = ProjectCustomFieldOption.objects.create(
        project=item.project, field=select, label="Qualified"
    )
    apply_custom_values(item, {str(select.id): str(option.id)}, actor=crm_admin)
    option.is_retired = True
    option.save()
    assert (
        apply_custom_values(item, {str(select.id): str(option.id)}, actor=crm_admin)
        == []
    )
    other = Issue.objects.create(
        project=item.project, workspace=item.workspace, name="New item"
    )
    with pytest.raises(ValidationError):
        apply_custom_values(other, {str(select.id): str(option.id)}, actor=crm_admin)
    select.is_archived = True
    select.save()
    assert serialize_custom_values(item)[str(select.id)] == str(option.id)
    with pytest.raises(ValidationError):
        apply_custom_values(item, {str(select.id): None}, actor=crm_admin)
    assert serialize_custom_values(item)[str(select.id)] == str(option.id)


def test_project_clear_requires_confirmation_and_snapshots(
    item, crm_admin, field_factory
):
    amount = field_factory(item.project, "currency", name="Opportunity Value")
    apply_custom_values(item, {str(amount.id): "10.00"}, actor=crm_admin)
    with pytest.raises(ValidationError):
        clear_project_values(item, actor=crm_admin, confirmed=False)
    changes = clear_project_values(item, actor=crm_admin, confirmed=True)
    assert len(changes) == 1
    assert changes[0]["old_value"]["value"] == "10.00"
    assert changes[0]["old_value"]["label"] == "Opportunity Value"
    assert changes[0]["new_value"]["value"] is None
    assert serialize_custom_values(item) == {}


def test_promotion_preserves_saved_archived_retired_values(
    item, crm_admin, field_factory
):
    from plane.db.models import DraftIssue

    select = field_factory(item.project, "select")
    option = ProjectCustomFieldOption.objects.create(
        project=item.project, field=select, label="Historical", is_retired=True
    )
    select.is_archived = True
    select.save()
    draft = DraftIssue.objects.create(
        project=item.project,
        workspace=item.workspace,
        name="Saved",
        custom_values={str(select.id): str(option.id)},
    )
    promote_draft_values(draft, item, actor=crm_admin)
    assert serialize_custom_values(item) == {str(select.id): str(option.id)}


def test_promotion_refuses_different_project(item, crm_admin, other_project):
    from plane.db.models import DraftIssue

    draft = DraftIssue.objects.create(
        project=other_project, workspace=other_project.workspace, name="Foreign"
    )
    with pytest.raises(ValidationError):
        promote_draft_values(draft, item, actor=crm_admin)
    assert serialize_custom_values(item) == {}


def test_draft_sparse_merge_and_no_project_rules(crm_project, field_factory):
    flag = field_factory(crm_project, "checkbox")
    key = str(flag.id)
    assert validate_draft_values(crm_project, {key: False}, {}) == {key: False}
    assert validate_draft_values(crm_project, {}, {key: False}) == {key: False}
    assert validate_draft_values(crm_project, {key: None}, {key: False}) == {}
    assert validate_draft_values(None, {}, {}) == {}
    with pytest.raises(ValidationError):
        validate_draft_values(None, {key: False}, {})


def test_draft_preserves_authoritative_historical_values_only(
    crm_project, field_factory
):
    select = field_factory(crm_project, "select")
    option = ProjectCustomFieldOption.objects.create(
        project=crm_project, field=select, label="Old", is_retired=True
    )
    key = str(select.id)
    baseline = {key: str(option.id)}
    assert validate_draft_values(crm_project, {}, baseline) == baseline
    assert validate_draft_values(crm_project, baseline, baseline) == baseline
    with pytest.raises(ValidationError):
        validate_draft_values(crm_project, baseline, {})
    select.is_archived = True
    select.save()
    assert validate_draft_values(crm_project, {}, baseline) == baseline
    with pytest.raises(ValidationError):
        validate_draft_values(crm_project, {key: None}, baseline)
