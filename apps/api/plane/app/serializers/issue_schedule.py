# SPDX-License-Identifier: AGPL-3.0-only
from rest_framework import serializers


def validate_optional_issue_schedule(attrs, instance=None):
    """Validate complete or partial schedules for both work items and drafts."""
    schedule = {}
    for date_field, time_field in (("start_date", "start_time"), ("target_date", "target_time")):
        old_date = getattr(instance, date_field, None)
        day = attrs.get(date_field, old_date)
        if date_field in attrs and (day is None or day != old_date) and time_field not in attrs:
            attrs[time_field] = None
        instant = attrs.get(time_field, getattr(instance, time_field, None))
        if instant is not None and day is None:
            raise serializers.ValidationError({time_field: "Set a date before adding a time."})
        schedule[date_field] = day
        schedule[time_field] = instant

    if schedule["start_time"] is not None and schedule["target_time"] is not None:
        if schedule["start_time"] > schedule["target_time"]:
            raise serializers.ValidationError({"target_time": "End time cannot precede start time."})
    elif schedule["start_date"] is not None and schedule["target_date"] is not None:
        if schedule["start_date"] > schedule["target_date"]:
            raise serializers.ValidationError("Start date cannot exceed target date")
    return attrs
