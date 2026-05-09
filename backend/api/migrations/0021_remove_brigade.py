from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0020_controlecorrection_mime_type_correction_and_more"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="classe",
            name="brigade",
        ),
        migrations.DeleteModel(
            name="Brigade",
        ),
    ]
