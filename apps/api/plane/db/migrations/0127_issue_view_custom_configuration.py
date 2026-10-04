# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("db", "0126_draft_custom_values")]
    operations = [
        migrations.AddField(
            model_name="issueview",
            name="custom_view",
            field=models.JSONField(default=dict),
        )
    ]
