from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0005_eventaudit"),
    ]

    operations = [
        migrations.AddField(
            model_name="speciality",
            name="corps",
            field=models.ForeignKey(blank=True, null=True, on_delete=models.CASCADE, related_name="specialities", to="api.corps"),
        ),
    ]
