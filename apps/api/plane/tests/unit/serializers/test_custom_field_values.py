# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
import pytest
from rest_framework.exceptions import ValidationError
from plane.app.services.custom_fields import validate_scalar
from plane.db.models import ProjectCustomField, ProjectCustomFieldOption


def field(kind):
    return ProjectCustomField(type=kind)


def test_currency_decimal_safe():
    assert validate_scalar(field("currency"), "0.10") == "0.10"
    assert validate_scalar(field("currency"), "0") == "0.00"
    assert validate_scalar(field("currency"), "-1.25") == "-1.25"
    assert (
        validate_scalar(field("currency"), "9999999999999999.99")
        == "9999999999999999.99"
    )


@pytest.mark.parametrize(
    "raw",
    [
        "1.001",
        "NaN",
        "Infinity",
        "-Infinity",
        "1e2",
        "10000000000000000.00",
        True,
        False,
        1,
        1.25,
        {},
        [],
    ],
)
def test_invalid_currency(raw):
    with pytest.raises(ValidationError):
        validate_scalar(field("currency"), raw)


def test_number_precision_and_nonfloat_storage():
    assert (
        validate_scalar(field("number"), "999999999999999999.999999")
        == "999999999999999999.999999"
    )
    assert validate_scalar(field("number"), "0.000001") == "0.000001"
    assert validate_scalar(field("number"), "001.250000") == "1.25"
    assert validate_scalar(field("number"), "0") == "0"
    for raw in ["1000000000000000000", "1.0000001", "1e-6", float("nan"), 1, False]:
        with pytest.raises(ValidationError):
            validate_scalar(field("number"), raw)


def test_text_limits_and_unset():
    assert validate_scalar(field("text"), "😀" * 2000) == "😀" * 2000
    assert validate_scalar(field("text"), "0") == "0"
    for raw in [None, "", "  "]:
        assert validate_scalar(field("text"), raw) is None
    for raw in ["x" * 2001, {}, 1, False]:
        with pytest.raises(ValidationError):
            validate_scalar(field("text"), raw)


def test_dates_and_checkbox_tri_state():
    assert validate_scalar(field("date"), "2024-02-29") == "2024-02-29"
    for raw in ["2025-02-29", "2026-13-01", "2026-1-1", "2026-01-01T00:00:00Z", True]:
        with pytest.raises(ValidationError):
            validate_scalar(field("date"), raw)
    assert validate_scalar(field("checkbox"), False) is False
    assert validate_scalar(field("checkbox"), True) is True
    assert validate_scalar(field("checkbox"), None) is None
    for raw in [0, 1, "false", "true"]:
        with pytest.raises(ValidationError):
            validate_scalar(field("checkbox"), raw)


@pytest.mark.django_db
def test_select_owned_active_option_only(crm_project, other_project, field_factory):
    select = field_factory(crm_project, "select")
    option = ProjectCustomFieldOption.objects.create(
        project=crm_project, field=select, label="Qualified"
    )
    assert validate_scalar(select, str(option.id)) == str(option.id)
    option.is_retired = True
    option.save()
    with pytest.raises(ValidationError):
        validate_scalar(select, str(option.id))
    foreign = field_factory(other_project, "select")
    other = ProjectCustomFieldOption.objects.create(
        project=other_project, field=foreign, label="Foreign"
    )
    with pytest.raises(ValidationError):
        validate_scalar(select, str(other.id))
    with pytest.raises(ValidationError):
        validate_scalar(select, "bad-uuid")
