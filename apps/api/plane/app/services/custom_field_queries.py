# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
import json
from uuid import UUID
from django.db.models import Exists, OuterRef, Subquery, F, Value, CharField, Case, When
from django.db.models.functions import Lower, Cast, Coalesce
from rest_framework.exceptions import ValidationError, NotFound
from django.db.models import Q
from plane.db.models import IssueView, ProjectMember, WorkspaceMember
from plane.db.models import IssueCustomFieldValue
from .custom_fields import resolve_fields, validate_scalar

BUILTIN_COLUMNS = {
    "name",
    "identifier",
    "state",
    "priority",
    "assignees",
    "labels",
    "start_date",
    "target_date",
    "created_at",
    "updated_at",
    "estimate",
    "cycle",
    "modules",
}
OPS = {
    "text": {"eq", "neq", "contains", "not_contains"},
    "number": {"eq", "neq", "gt", "gte", "lt", "lte"},
    "currency": {"eq", "neq", "gt", "gte", "lt", "lte"},
    "date": {"eq", "neq", "gt", "gte", "lt", "lte"},
    "checkbox": {"eq", "neq"},
    "select": {"eq", "neq"},
}
COLUMNS = {
    "text": "text_value",
    "number": "decimal_value",
    "currency": "decimal_value",
    "date": "date_value",
    "checkbox": "boolean_value",
    "select": "option_id",
}


def reject(message):
    raise ValidationError({"custom_view": message})


def object_keys(value, allowed, required):
    if (
        not isinstance(value, dict)
        or set(value) - set(allowed)
        or not set(required).issubset(value)
    ):
        reject("Invalid configuration object.")
    if "field_id" in value and not isinstance(value["field_id"], str):
        reject("Field identifiers must be UUID strings.")


def validate_custom_view(project, raw):
    if raw == {}:
        return {}
    try:
        if len(json.dumps(raw, ensure_ascii=False).encode("utf-8")) > 32768:
            reject("Configuration exceeds 32 KiB.")
    except (TypeError, ValueError, UnicodeEncodeError):
        reject("Configuration must be valid JSON.")
    object_keys(
        raw,
        {"version", "columns", "conditions", "sort", "group_by", "metrics"},
        {"version"},
    )
    if type(raw["version"]) is not int or raw["version"] != 1:
        reject("Unsupported version.")
    if project is None:
        reject("Custom configuration requires a project.")
    result = {
        "version": 1,
        "columns": raw.get("columns", []),
        "conditions": raw.get("conditions", []),
        "sort": raw.get("sort"),
        "group_by": raw.get("group_by"),
        "metrics": raw.get("metrics", []),
    }
    for name, limit in [("columns", 75), ("conditions", 50), ("metrics", 50)]:
        if not isinstance(result[name], list) or len(result[name]) > limit:
            reject(f"Invalid {name} limit.")
    ids = []
    columns = set()
    for column in result["columns"]:
        object_keys(column, {"kind", "key", "field_id"}, {"kind"})
        if column["kind"] == "builtin":
            if (
                set(column) != {"kind", "key"}
                or not isinstance(column.get("key"), str)
                or column["key"] not in BUILTIN_COLUMNS
            ):
                reject("Unknown built-in column.")
            key = ("builtin", column["key"])
        elif column["kind"] == "custom":
            if set(column) != {"kind", "field_id"}:
                reject("Invalid custom column.")
            ids.append(column["field_id"])
            key = ("custom", column["field_id"])
        else:
            reject("Unknown column kind.")
        if key in columns:
            reject("Duplicate columns.")
        columns.add(key)
    for condition in result["conditions"]:
        object_keys(
            condition, {"field_id", "operator", "value"}, {"field_id", "operator"}
        )
        ids.append(condition["field_id"])
    if result["sort"] is not None:
        object_keys(
            result["sort"], {"field_id", "direction"}, {"field_id", "direction"}
        )
        if result["sort"]["direction"] not in ("asc", "desc"):
            reject("Invalid sort direction.")
        ids.append(result["sort"]["field_id"])
    if result["group_by"] is not None:
        object_keys(result["group_by"], {"field_id"}, {"field_id"})
        ids.append(result["group_by"]["field_id"])
    seen = set()
    for metric in result["metrics"]:
        object_keys(metric, {"field_id", "scopes"}, {"field_id", "scopes"})
        if (
            not isinstance(metric["scopes"], list)
            or not metric["scopes"]
            or any(
                scope not in ("all", "open", "filtered") for scope in metric["scopes"]
            )
            or len(set(metric["scopes"])) != len(metric["scopes"])
        ):
            reject("Invalid metric scopes.")
        if metric["field_id"] in seen:
            reject("Duplicate metric.")
        seen.add(metric["field_id"])
        ids.append(metric["field_id"])
    fields = resolve_fields(project.id, ids, for_write=False)
    for condition in result["conditions"]:
        field = fields[UUID(str(condition["field_id"]))]
        operator = condition["operator"]
        if not isinstance(operator, str):
            reject("Operator must be a string.")
        if operator in ("is_set", "is_unset"):
            if "value" in condition:
                reject("Unset predicates do not take a value.")
        elif operator in OPS[field.type]:
            if "value" not in condition:
                reject("Condition requires a value.")
            if field.type == "select":
                try:
                    option_id = UUID(str(condition["value"]))
                except (ValueError, TypeError, AttributeError):
                    reject("Invalid option identifier.")
                if not any(option.id == option_id for option in field.options.all()):
                    reject("Unknown option.")
                normalized = str(option_id)
            else:
                normalized = validate_scalar(field, condition["value"])
            if normalized is None:
                reject("Use unset predicates for missing values.")
            condition["value"] = normalized
        else:
            reject("Unsupported operator for field type.")
    if result["group_by"] and fields[
        UUID(str(result["group_by"]["field_id"]))
    ].type not in ("select", "checkbox"):
        reject("Only select and checkbox fields can group items.")
    for metric in result["metrics"]:
        if fields[UUID(str(metric["field_id"]))].type not in ("currency", "number"):
            reject("Totals require a numeric field.")
    return result


def resolve_view_config(*, user, project, view_id=None, override=None):
    member = ProjectMember.objects.filter(
        project=project, member=user, is_active=True
    ).first()
    if (
        member is None
        or not WorkspaceMember.objects.filter(
            workspace_id=project.workspace_id, member=user, is_active=True
        ).exists()
    ):
        raise NotFound("Project not found.")
    saved = None
    if view_id is not None:
        try:
            view_id = UUID(str(view_id))
        except (ValueError, TypeError, AttributeError):
            raise NotFound("View not found.")
        saved = (
            IssueView.objects.filter(project=project, id=view_id)
            .filter(Q(owned_by=user) | Q(access=1))
            .first()
        )
        if saved is None or (
            member.role == 5
            and not project.guest_view_all_features
            and saved.owned_by_id != user.id
        ):
            raise NotFound("View not found.")
    if isinstance(override, str):
        if len(override.encode("utf-8")) > 32768:
            reject("Configuration exceeds 32 KiB.")
        try:
            override = json.loads(override)
        except (ValueError, TypeError):
            reject("Invalid configuration JSON.")
    return validate_custom_view(
        project,
        override if override is not None else saved.custom_view if saved else {},
    )


def query_fields(queryset, config):
    ids = [condition["field_id"] for condition in config.get("conditions", [])]
    if config.get("sort"):
        ids.append(config["sort"]["field_id"])
    # The config was validated against the authorized project before execution.
    from plane.db.models import ProjectCustomField

    return {
        str(field.id): field for field in ProjectCustomField.objects.filter(id__in=ids)
    }


def apply_custom_conditions(queryset, config):
    fields = query_fields(queryset, config)
    for condition in config.get("conditions", []):
        field = fields[str(condition["field_id"])]
        operator = condition["operator"]
        rows = IssueCustomFieldValue.objects.filter(
            issue_id=OuterRef("pk"), field=field
        )
        if operator == "is_set":
            queryset = queryset.filter(Exists(rows))
            continue
        if operator == "is_unset":
            queryset = queryset.filter(~Exists(rows))
            continue
        column = COLUMNS[field.type]
        lookup = (
            "icontains"
            if operator in ("contains", "not_contains")
            else (
                ("iexact" if field.type == "text" else "exact")
                if operator in ("eq", "neq")
                else operator
            )
        )
        matching = rows.filter(**{f"{column}__{lookup}": condition["value"]})
        if operator in ("neq", "not_contains"):
            queryset = queryset.filter(Exists(rows), ~Exists(matching))
        else:
            queryset = queryset.filter(Exists(matching))
    return queryset


def apply_custom_sort(queryset, config):
    sort = config.get("sort")
    if not sort:
        return queryset
    field = query_fields(queryset, config)[str(sort["field_id"])]
    rows = IssueCustomFieldValue.objects.filter(issue_id=OuterRef("pk"), field=field)
    column = COLUMNS[field.type]
    if field.type == "select":
        expression = Subquery(rows.values("option__sort_order")[:1])
        queryset = queryset.annotate(
            _custom_option=Subquery(rows.values("option_id")[:1])
        )
        ties = [F("_custom_option").asc(nulls_last=True), "id"]
    else:
        expression = Subquery(rows.values(column)[:1])
        if field.type == "text":
            expression = Lower(expression)
        ties = ["id"]
    queryset = queryset.annotate(_custom_sort=expression)
    order = (
        F("_custom_sort").asc(nulls_last=True)
        if sort["direction"] == "asc"
        else F("_custom_sort").desc(nulls_last=True)
    )
    return queryset.order_by(order, *ties)


def get_custom_group(field):
    rows = IssueCustomFieldValue.objects.filter(issue_id=OuterRef("pk"), field=field)
    if field.type == "select":
        expression = Coalesce(
            Cast(Subquery(rows.values("option_id")[:1]), CharField()), Value("unset")
        )
    elif field.type == "checkbox":
        scalar = Subquery(rows.values("boolean_value")[:1])
        expression = Case(
            When(Exists(rows.filter(boolean_value=True)), then=Value("true")),
            When(Exists(rows.filter(boolean_value=False)), then=Value("false")),
            default=Value("unset"),
            output_field=CharField(),
        )
    else:
        reject("Unsupported grouping type.")
    return {"custom_group": expression}


def eligible_custom_items(*, user, project, include_subissues):
    from plane.db.models import Issue

    member = ProjectMember.objects.filter(
        project=project, member=user, is_active=True
    ).first()
    if (
        member is None
        or not WorkspaceMember.objects.filter(
            workspace_id=project.workspace_id, member=user, is_active=True
        ).exists()
    ):
        raise NotFound("Project not found.")
    items = Issue.issue_objects.filter(
        project=project, archived_at__isnull=True, is_draft=False
    )
    if member.role == 5 and not project.guest_view_all_features:
        items = items.filter(created_by=user)
    if not include_subissues:
        items = items.filter(parent__isnull=True)
    return items


def aggregate_custom_fields(
    *, user, project, config, builtin_filters, rich_filters, display_filters
):
    from types import SimpleNamespace
    from decimal import Decimal, localcontext
    from django.db.models import Sum
    from plane.utils.issue_filters import issue_filters
    from plane.utils.filters import ComplexFilterBackend, IssueFilterSet

    config = validate_custom_view(project, config)
    include = display_filters.get("sub_issue", False)
    if type(include) is not bool:
        reject("Sub-item inclusion must be boolean.")
    base = eligible_custom_items(user=user, project=project, include_subissues=include)
    filters = {**builtin_filters, "sub_issue": "true" if include else "false"}
    filtered = base.filter(**issue_filters(filters, "POST"))
    if rich_filters:
        filtered = ComplexFilterBackend().filter_queryset(
            None,
            filtered,
            SimpleNamespace(filterset_class=IssueFilterSet),
            filter_data=rich_filters,
        )
    filtered = apply_custom_conditions(filtered, config)
    sets = {
        "all": base,
        "open": base.exclude(state__group__in=["completed", "cancelled"]),
        "filtered": filtered,
    }
    fields = resolve_fields(
        project.id,
        [metric["field_id"] for metric in config.get("metrics", [])],
        for_write=False,
    )
    group_field = None
    if config.get("group_by"):
        group_field = next(
            iter(
                resolve_fields(
                    project.id, [config["group_by"]["field_id"]], for_write=False
                ).values()
            )
        )
    builtin_group = display_filters.get("group_by") if not group_field else None
    builtin_buckets = []
    builtin_path = None
    overlap = False
    if builtin_group:
        from plane.db.models import Label, State, ProjectMember, Module, Cycle

        metadata = {
            "labels": (
                Label.objects.filter(project=project),
                "labels__id",
                "name",
                True,
            ),
            "state": (State.objects.filter(project=project), "state_id", "name", False),
            "assignees": (
                ProjectMember.objects.filter(
                    project=project, is_active=True
                ).select_related("member"),
                "assignees__id",
                "member",
                True,
            ),
            "module": (
                Module.objects.filter(project=project, archived_at__isnull=True),
                "issue_module__module_id",
                "name",
                True,
            ),
            "cycle": (
                Cycle.objects.filter(project=project),
                "issue_cycle__cycle_id",
                "name",
                False,
            ),
        }
        if builtin_group == "priority":
            builtin_path = "priority"
            builtin_buckets = [
                (key, key) for key in ["urgent", "high", "medium", "low", "none"]
            ]
        elif builtin_group == "state_detail.group":
            builtin_path = "state__group"
            builtin_buckets = [
                (key, key)
                for key in ["backlog", "unstarted", "started", "completed", "cancelled"]
            ]
        elif builtin_group in metadata:
            definitions, builtin_path, label_attr, overlap = metadata[builtin_group]
            for definition in definitions.order_by("id"):
                key = (
                    definition.member_id
                    if builtin_group == "assignees"
                    else definition.id
                )
                builtin_buckets.append((str(key), str(getattr(definition, label_attr))))
            builtin_buckets.append(("unset", "Unset"))
        else:
            reject("Unsupported total grouping.")
    metrics = []

    def summarize(items, field):
        ids = items.order_by().values("id").distinct()
        values = IssueCustomFieldValue.objects.filter(field=field, issue_id__in=ids)
        count = ids.count()
        valued = values.count()
        total = values.aggregate(total=Sum("decimal_value"))["total"] or Decimal(0)
        with localcontext() as context:
            context.prec = max(50, len(total.as_tuple().digits) + 6)
            formatted = (
                format(total, ".2f") if field.type == "currency" else format(total, "f")
            )
        if field.type == "number" and "." in formatted:
            formatted = formatted.rstrip("0").rstrip(".")
        return {
            "total": formatted,
            "item_count": count,
            "valued_count": valued,
            "missing_count": count - valued,
        }

    for metric in config.get("metrics", []):
        field = fields[UUID(str(metric["field_id"]))]
        scopes = {scope: summarize(sets[scope], field) for scope in metric["scopes"]}
        groups = []
        if group_field:
            if group_field.type == "checkbox":
                buckets = [("false", "False"), ("true", "True"), ("unset", "Unset")]
            else:
                buckets = [
                    (str(option.id), option.label)
                    for option in group_field.options.all()
                ] + [("unset", "Unset")]
            for key, label in buckets:
                grouped = {
                    scope: summarize(
                        sets[scope]
                        .annotate(**get_custom_group(group_field))
                        .filter(custom_group=key),
                        field,
                    )
                    for scope in metric["scopes"]
                }
                groups.append({"key": key, "label": label, "scopes": grouped})
        elif builtin_path:
            for key, label in builtin_buckets:
                grouped = {}
                for scope in metric["scopes"]:
                    items = sets[scope]
                    items = (
                        items.filter(**{builtin_path + "__isnull": True})
                        if key == "unset"
                        else items.filter(**{builtin_path: key})
                    )
                    if builtin_group == "labels":
                        items = items.filter(label_issue__deleted_at__isnull=True)
                    if builtin_group == "assignees":
                        items = items.filter(issue_assignee__deleted_at__isnull=True)
                    if builtin_group == "module":
                        items = items.filter(issue_module__deleted_at__isnull=True)
                    if builtin_group == "cycle":
                        items = items.filter(issue_cycle__deleted_at__isnull=True)
                    grouped[scope] = summarize(items, field)
                groups.append({"key": key, "label": label, "scopes": grouped})
        metrics.append(
            {
                "field_id": str(field.id),
                "type": field.type,
                "scopes": scopes,
                "groups": groups,
            }
        )
    return {"metrics": metrics, "groups_may_overlap": overlap}
