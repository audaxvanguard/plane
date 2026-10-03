# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
import pytest
from django.db import IntegrityError, transaction
from plane.db.models import Issue, IssueCustomFieldValue

pytestmark = pytest.mark.django_db


def test_typed_value_columns_and_unique_item_field(crm_project, field_factory):
    field = field_factory(crm_project, "checkbox")
    issue = Issue.objects.create(
        project=crm_project, workspace=crm_project.workspace, name="Test"
    )
    value = IssueCustomFieldValue.objects.create(
        project=crm_project, issue=issue, field=field, boolean_value=False
    )
    assert value.boolean_value is False
    with pytest.raises(IntegrityError), transaction.atomic():
        IssueCustomFieldValue.objects.create(
            project=crm_project, issue=issue, field=field, boolean_value=True
        )
    second = field_factory(crm_project, "text")
    with pytest.raises(IntegrityError), transaction.atomic():
        IssueCustomFieldValue.objects.create(
            project=crm_project, issue=issue, field=second
        )
    with pytest.raises(IntegrityError), transaction.atomic():
        IssueCustomFieldValue.objects.create(
            project=crm_project,
            issue=issue,
            field=second,
            text_value="x",
            boolean_value=False,
        )


def test_field_resolver_scopes_and_archived_readonly(
    crm_project, other_project, field_factory
):
    from rest_framework.exceptions import ValidationError
    from plane.app.services.custom_fields import resolve_fields

    field = field_factory(crm_project, "text")
    field.is_archived = True
    field.save()
    assert resolve_fields(crm_project.id, [str(field.id)], for_write=False)[
        field.id
    ].is_archived
    with pytest.raises(ValidationError):
        resolve_fields(crm_project.id, [field.id], for_write=True)
    other = field_factory(other_project, "text")
    with pytest.raises(ValidationError):
        resolve_fields(crm_project.id, [other.id], for_write=False)
    with pytest.raises(ValidationError):
        resolve_fields(crm_project.id, ["bad-uuid"], for_write=False)


def test_typed_lookup_indexes_exist():
    fields = [tuple(index.fields) for index in IssueCustomFieldValue._meta.indexes]
    for name in ("decimal_value", "date_value", "boolean_value", "option"):
        assert ("field", name) in fields
    assert any(
        index.name == "cf_value_text_prefix_idx"
        for index in IssueCustomFieldValue._meta.indexes
    )


def test_large_unicode_text_is_indexable(crm_project, field_factory):
    field = field_factory(crm_project, "text")
    issue = Issue.objects.create(
        project=crm_project, workspace=crm_project.workspace, name="Unicode"
    )
    value = IssueCustomFieldValue.objects.create(
        project=crm_project, issue=issue, field=field, text_value="😀" * 2000
    )
    assert IssueCustomFieldValue.objects.get(id=value.id).text_value == "😀" * 2000
