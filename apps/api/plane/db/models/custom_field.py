# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
from functools import reduce
from operator import or_
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models.functions import Substr
from .project import ProjectBaseModel


def normalized_name(value):
    return " ".join(value.split())


class ProjectCustomField(ProjectBaseModel):
    TYPE_CHOICES = [
        (kind, kind)
        for kind in ("text", "number", "currency", "date", "checkbox", "select")
    ]
    name = models.CharField(max_length=255)
    name_key = models.TextField(editable=False)
    description = models.TextField(blank=True, default="")
    type = models.CharField(max_length=16, choices=TYPE_CHOICES)
    sort_order = models.PositiveIntegerField(default=0)
    is_archived = models.BooleanField(default=False)

    class Meta:
        db_table = "project_custom_fields"
        ordering = ("sort_order", "created_at", "id")
        constraints = [
            models.UniqueConstraint(
                fields=["project", "name_key"], name="cf_project_name_unique"
            )
        ]
        indexes = [
            models.Index(
                fields=["project", "is_archived", "sort_order"],
                name="cf_project_active_order_idx",
            )
        ]

    def save(self, *args, **kwargs):
        self.name = normalized_name(self.name)
        self.name_key = self.name.casefold()
        super().save(*args, **kwargs)


class ProjectCustomFieldOption(ProjectBaseModel):
    field = models.ForeignKey(
        ProjectCustomField, on_delete=models.CASCADE, related_name="options"
    )
    label = models.CharField(max_length=255)
    color = models.CharField(max_length=7, default="#808080")
    sort_order = models.PositiveIntegerField(default=0)
    is_retired = models.BooleanField(default=False)

    class Meta:
        db_table = "project_custom_field_options"
        ordering = ("sort_order", "created_at", "id")
        indexes = [
            models.Index(fields=["field", "sort_order"], name="cf_option_order_idx")
        ]

    def save(self, *args, **kwargs):
        self.project = self.field.project
        super().save(*args, **kwargs)


VALUE_COLUMNS = ("text_value", "decimal_value", "date_value", "boolean_value", "option")


def one_typed_value():
    return reduce(
        or_,
        (
            models.Q(
                **{f"{column}__isnull": column != chosen for column in VALUE_COLUMNS}
            )
            for chosen in VALUE_COLUMNS
        ),
    )


class IssueCustomFieldValue(ProjectBaseModel):
    issue = models.ForeignKey(
        "db.Issue", on_delete=models.CASCADE, related_name="custom_field_values"
    )
    field = models.ForeignKey(
        ProjectCustomField, on_delete=models.CASCADE, related_name="issue_values"
    )
    text_value = models.TextField(null=True)
    decimal_value = models.DecimalField(max_digits=24, decimal_places=6, null=True)
    date_value = models.DateField(null=True)
    boolean_value = models.BooleanField(null=True)
    option = models.ForeignKey(
        ProjectCustomFieldOption,
        on_delete=models.RESTRICT,
        null=True,
        related_name="issue_values",
    )

    class Meta:
        db_table = "issue_custom_field_values"
        constraints = [
            models.UniqueConstraint(
                fields=["issue", "field"], name="cf_issue_field_unique"
            ),
            models.CheckConstraint(
                condition=one_typed_value(), name="cf_exactly_one_typed_value"
            ),
        ]
        indexes = [
            # A full Unicode text B-tree entry may exceed PostgreSQL's 2704-byte
            # limit. Prefix-index comparisons must still check the full value.
            models.Index(
                models.F("field"),
                Substr("text_value", 1, 600),
                name="cf_value_text_prefix_idx",
            ),
            *[
                models.Index(fields=["field", name], name=f"cf_value_{short}_idx")
                for name, short in (
                    ("decimal_value", "decimal"),
                    ("date_value", "date"),
                    ("boolean_value", "bool"),
                    ("option", "option"),
                )
            ],
        ]

    def save(self, *args, **kwargs):
        if self.issue.project_id != self.field.project_id:
            raise ValidationError(
                "Custom field and item must belong to the same project."
            )
        if self.option_id and self.option.field_id != self.field_id:
            raise ValidationError("Option must belong to this field.")
        self.project = self.issue.project
        super().save(*args, **kwargs)
