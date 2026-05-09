from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone
import api.models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("api", "0024_sujetfinstage_fichier_word"),
    ]

    operations = [
        migrations.RemoveField(model_name="sujetfinstage", name="fichier_word"),
        migrations.RemoveField(model_name="sujetfinstage", name="nom_fichier_word"),
        migrations.RemoveField(model_name="sujetfinstage", name="mime_type_word"),
        migrations.CreateModel(
            name="SujetFinStageFichier",
            fields=[
                ("id", models.CharField(default=api.models.generate_id, editable=False, max_length=50, primary_key=True, serialize=False)),
                ("titre", models.CharField(blank=True, default="", max_length=255)),
                ("nom_fichier", models.CharField(blank=True, default="", max_length=255)),
                ("mime_type", models.CharField(blank=True, default="application/vnd.openxmlformats-officedocument.wordprocessingml.document", max_length=100)),
                ("fichier", models.BinaryField(blank=True, null=True)),
                ("uploaded_at", models.DateTimeField(default=django.utils.timezone.now)),
                ("uploaded_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="sujets_fichiers_uploades", to=settings.AUTH_USER_MODEL)),
            ],
        ),
    ]
