from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0017_userprofile_fichier_renseignement'),
    ]

    operations = [
        migrations.CreateModel(
            name='FichierRenseignementTemplate',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('fichier', models.BinaryField(blank=True, null=True)),
                ('nom_fichier', models.CharField(blank=True, default='', max_length=255)),
                ('mime_type', models.CharField(blank=True, default='', max_length=100)),
                ('uploaded_at', models.DateTimeField(auto_now=True)),
            ],
        ),
    ]
