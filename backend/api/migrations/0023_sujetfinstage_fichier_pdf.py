from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0022_remove_classe"),
    ]

    operations = [
        migrations.AddField(
            model_name="sujetfinstage",
            name="fichier_pdf",
            field=models.BinaryField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="sujetfinstage",
            name="nom_fichier_pdf",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
        migrations.AddField(
            model_name="sujetfinstage",
            name="mime_type_pdf",
            field=models.CharField(blank=True, default="", max_length=100),
        ),
    ]
