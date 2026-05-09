from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0021_remove_brigade"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="cours",
            name="classe",
        ),
        migrations.DeleteModel(
            name="AffectationInstructeurClasse",
        ),
        migrations.DeleteModel(
            name="StagiaireClasse",
        ),
        migrations.DeleteModel(
            name="Classe",
        ),
    ]
