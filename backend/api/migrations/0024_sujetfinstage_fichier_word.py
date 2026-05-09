from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0023_sujetfinstage_fichier_pdf"),
    ]

    operations = [
        migrations.AddField(
            model_name="sujetfinstage",
            name="fichier_word",
            field=models.BinaryField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="sujetfinstage",
            name="nom_fichier_word",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
        migrations.AddField(
            model_name="sujetfinstage",
            name="mime_type_word",
            field=models.CharField(blank=True, default="", max_length=100),
        ),
    ]
