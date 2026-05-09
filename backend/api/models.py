from django.contrib.auth import get_user_model
from django.db import models
from django.utils import timezone
from uuid import uuid4


def generate_id() -> str:
    return str(uuid4())


class UserProfile(models.Model):
    ROLE_INSTRUCTEUR = "Instructeur"
    ROLE_STAGIAIRE = "Stagiaire"
    ROLE_ADMIN = "Admin"
    ROLE_COORDINATEUR = "Coordinateur"

    ROLE_CHOICES = [
        (ROLE_INSTRUCTEUR, "Instructeur"),
        (ROLE_STAGIAIRE, "Stagiaire"),
        (ROLE_ADMIN, "Admin"),
        (ROLE_COORDINATEUR, "Coordinateur"),
    ]

    user = models.OneToOneField(get_user_model(), on_delete=models.CASCADE, related_name="profile")
    role = models.CharField(max_length=32, choices=ROLE_CHOICES, default=ROLE_STAGIAIRE)
    matricule = models.CharField(max_length=50, blank=True, default="")
    est_civil = models.BooleanField(default=False)
    corps = models.ForeignKey("Corps", on_delete=models.SET_NULL, null=True, blank=True, related_name="profiles")
    rank = models.ForeignKey("Rank", on_delete=models.SET_NULL, null=True, blank=True, related_name="profiles")
    speciality = models.ForeignKey("Speciality", on_delete=models.SET_NULL, null=True, blank=True, related_name="profiles")
    fichier_renseignement = models.BinaryField(null=True, blank=True)
    nom_fichier_renseignement = models.CharField(max_length=255, blank=True, default="")
    mime_type_renseignement = models.CharField(max_length=100, blank=True, default="")

    def __str__(self):
        return f"{self.user.username} ({self.role})"


class FichierRenseignementTemplate(models.Model):
    """Singleton model: stores the template document set by admin for stagiaires to download."""
    fichier = models.BinaryField(null=True, blank=True)
    nom_fichier = models.CharField(max_length=255, blank=True, default="")
    mime_type = models.CharField(max_length=100, blank=True, default="")
    uploaded_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Template: {self.nom_fichier or '(none)'}"


class Specialite(models.Model):
    id_specialite = models.CharField(max_length=50, primary_key=True, default=generate_id, editable=False)
    libelle = models.CharField(max_length=255, unique=True)

    def __str__(self):
        return self.libelle


class Corps(models.Model):
    id_corps = models.CharField(max_length=50, primary_key=True, default=generate_id, editable=False)
    code = models.CharField(max_length=50, unique=True)
    label = models.CharField(max_length=255, unique=True)

    def __str__(self):
        return self.label


class Rank(models.Model):
    id_rank = models.CharField(max_length=50, primary_key=True, default=generate_id, editable=False)
    code = models.CharField(max_length=50, unique=True)
    label = models.CharField(max_length=255, unique=True)
    corps = models.ForeignKey(Corps, on_delete=models.CASCADE, related_name="ranks")

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["corps", "label"], name="uq_rank_corps_label"),
        ]

    def __str__(self):
        return f"{self.label} ({self.corps.code})"


class Speciality(models.Model):
    id_speciality = models.CharField(max_length=50, primary_key=True, default=generate_id, editable=False)
    code = models.CharField(max_length=50, unique=True)
    label = models.CharField(max_length=255, unique=True)
    corps = models.ForeignKey("Corps", on_delete=models.CASCADE, null=True, blank=True, related_name="specialities")

    def __str__(self):
        return self.label


class InstructeurProfil(models.Model):
    instructeur = models.OneToOneField(
        get_user_model(),
        on_delete=models.CASCADE,
        related_name="instructeur_profil",
    )
    specialite = models.ForeignKey(Specialite, on_delete=models.PROTECT, related_name="instructeurs")
    est_civil = models.BooleanField(default=False)


class Module(models.Model):
    id_module = models.CharField(max_length=50, primary_key=True, default=generate_id, editable=False)
    nom = models.CharField(max_length=255)
    ordre = models.IntegerField(default=0)

    class Meta:
        ordering = ["ordre", "nom"]

    def __str__(self):
        return self.nom


class Matiere(models.Model):
    id_matiere = models.CharField(max_length=50, primary_key=True, default=generate_id, editable=False)
    nom = models.CharField(max_length=255)
    module = models.ForeignKey(Module, on_delete=models.CASCADE, related_name="matieres")
    ordre = models.IntegerField(default=0)

    class Meta:
        ordering = ["ordre", "nom"]

    def __str__(self):
        return self.nom


class Brochure(models.Model):
    id_brochure = models.CharField(max_length=50, primary_key=True, default=generate_id, editable=False)
    nom = models.CharField(max_length=255)
    matiere = models.ForeignKey(Matiere, on_delete=models.CASCADE, related_name="brochures")
    ordre = models.IntegerField(default=0)

    class Meta:
        ordering = ["ordre", "nom"]

    def __str__(self):
        return self.nom


class Cours(models.Model):
    STATUT_BROUILLON = "BROUILLON"
    STATUT_PUBLIE = "PUBLIE"
    STATUT_ARCHIVE = "ARCHIVE"
    STATUT_CHOICES = [
        (STATUT_BROUILLON, "Brouillon"),
        (STATUT_PUBLIE, "Publie"),
        (STATUT_ARCHIVE, "Archive"),
    ]

    id_cours = models.CharField(max_length=50, primary_key=True, default=generate_id, editable=False)
    titre = models.CharField(max_length=255)
    description = models.TextField(blank=True, default="")
    date_depot = models.DateField(default=timezone.now)
    instructeur = models.ForeignKey(get_user_model(), on_delete=models.PROTECT, related_name="cours")
    specialite = models.ForeignKey(
        Specialite,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="cours",
    )
    statut = models.CharField(max_length=30, choices=STATUT_CHOICES, default=STATUT_BROUILLON)
    matiere = models.ForeignKey(
        "Matiere",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="cours",
    )
    module = models.ForeignKey(
        Module,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="cours",
    )
    brochure = models.ForeignKey(
        "Brochure",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="cours",
    )


class CoursFichier(models.Model):
    id_cours_fichier = models.CharField(max_length=50, primary_key=True, default=generate_id, editable=False)
    cours = models.ForeignKey(Cours, on_delete=models.CASCADE, related_name="fichiers")
    nom_fichier = models.CharField(max_length=255)
    mime_type = models.CharField(max_length=100)
    taille_octets = models.BigIntegerField(default=0)
    fichier = models.FileField(upload_to="cours_fichiers/", blank=True, null=True)
    date_ajout = models.DateTimeField(default=timezone.now)


class SessionCours(models.Model):
    id_session = models.CharField(max_length=50, primary_key=True, default=generate_id, editable=False)
    cours = models.ForeignKey(Cours, on_delete=models.CASCADE, related_name="sessions")
    date_debut = models.DateTimeField()
    date_fin = models.DateTimeField()
    salle = models.CharField(max_length=100, blank=True, default="")

    class Meta:
        constraints = [
            models.CheckConstraint(condition=models.Q(date_fin__gt=models.F("date_debut")), name="ck_session_dates"),
        ]


class Inscription(models.Model):
    STATUT_ACTIVE = "ACTIVE"
    STATUT_SUSPENDUE = "SUSPENDUE"
    STATUT_TERMINEE = "TERMINEE"
    STATUT_ANNULEE = "ANNULEE"
    STATUT_CHOICES = [
        (STATUT_ACTIVE, "Active"),
        (STATUT_SUSPENDUE, "Suspendue"),
        (STATUT_TERMINEE, "Terminee"),
        (STATUT_ANNULEE, "Annulee"),
    ]

    id_inscription = models.CharField(max_length=50, primary_key=True, default=generate_id, editable=False)
    stagiaire = models.ForeignKey(get_user_model(), on_delete=models.CASCADE, related_name="inscriptions")
    cours = models.ForeignKey(Cours, on_delete=models.CASCADE, related_name="inscriptions")
    date_inscription = models.DateTimeField(default=timezone.now)
    statut = models.CharField(max_length=30, choices=STATUT_CHOICES, default=STATUT_ACTIVE)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["stagiaire", "cours"], name="uq_stagiaire_cours"),
        ]


class Controle(models.Model):
    STATUT_BROUILLON = "BROUILLON"
    STATUT_PUBLIE = "PUBLIE"
    STATUT_CLOTURE = "CLOTURE"
    STATUT_CORRIGE = "CORRIGE"
    STATUT_CHOICES = [
        (STATUT_BROUILLON, "Brouillon"),
        (STATUT_PUBLIE, "Publie"),
        (STATUT_CLOTURE, "Cloture"),
        (STATUT_CORRIGE, "Corrige"),
    ]

    id_controle = models.CharField(max_length=50, primary_key=True, default=generate_id, editable=False)
    cours = models.ForeignKey(Cours, on_delete=models.CASCADE, related_name="controles")
    instructeur = models.ForeignKey(get_user_model(), on_delete=models.PROTECT, related_name="controles")
    nom = models.CharField(max_length=255)
    date_limite = models.DateTimeField(null=True, blank=True)
    bareme = models.DecimalField(max_digits=5, decimal_places=2, default=20)
    statut = models.CharField(max_length=30, choices=STATUT_CHOICES, default=STATUT_BROUILLON)
    enonce = models.TextField(blank=True, default="")
    date_publication = models.DateTimeField(null=True, blank=True)
    fichier_enonce = models.BinaryField(null=True, blank=True)
    nom_fichier_enonce = models.CharField(max_length=255, blank=True, default="")
    mime_type_enonce = models.CharField(max_length=100, blank=True, default="")


class SoumissionControle(models.Model):
    STATUT_BROUILLON = "BROUILLON"
    STATUT_SOUMIS = "SOUMIS"
    STATUT_RETARD = "RETARD"
    STATUT_ANNULE = "ANNULE"
    STATUT_CHOICES = [
        (STATUT_BROUILLON, "Brouillon"),
        (STATUT_SOUMIS, "Soumis"),
        (STATUT_RETARD, "Retard"),
        (STATUT_ANNULE, "Annule"),
    ]

    id_soumission = models.CharField(max_length=50, primary_key=True, default=generate_id, editable=False)
    controle = models.ForeignKey(Controle, on_delete=models.CASCADE, related_name="soumissions")
    stagiaire = models.ForeignKey(get_user_model(), on_delete=models.CASCADE, related_name="soumissions")
    date_soumission = models.DateTimeField(default=timezone.now)
    fichier_reponse = models.BinaryField(null=True, blank=True)
    nom_fichier_reponse = models.CharField(max_length=255, blank=True, default="")
    mime_type_reponse = models.CharField(max_length=100, blank=True, default="")
    commentaire = models.TextField(blank=True, default="")
    statut = models.CharField(max_length=30, choices=STATUT_CHOICES, default=STATUT_SOUMIS)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["controle", "stagiaire"], name="uq_controle_stagiaire_soumission"),
        ]


class ControleCorrection(models.Model):
    id_correction = models.CharField(max_length=50, primary_key=True, default=generate_id, editable=False)
    controle = models.ForeignKey(Controle, on_delete=models.CASCADE, related_name="corrections")
    version_no = models.PositiveIntegerField()
    titre = models.CharField(max_length=255, blank=True, default="")
    texte_correction = models.TextField(blank=True, default="")
    fichier_correction = models.BinaryField(null=True, blank=True)
    nom_fichier_correction = models.CharField(max_length=255, blank=True, default="")
    mime_type_correction = models.CharField(max_length=100, blank=True, default="")
    date_publication = models.DateTimeField(default=timezone.now)
    publie_par = models.ForeignKey(get_user_model(), on_delete=models.PROTECT, related_name="corrections_publiees")

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["controle", "version_no"], name="uq_controle_correction_version"),
        ]


class Evaluation(models.Model):
    id_evaluation = models.CharField(max_length=50, primary_key=True, default=generate_id, editable=False)
    soumission = models.OneToOneField(
        SoumissionControle,
        on_delete=models.CASCADE,
        related_name="evaluation",
    )
    instructeur = models.ForeignKey(get_user_model(), on_delete=models.PROTECT, related_name="evaluations")
    note = models.DecimalField(max_digits=5, decimal_places=2)
    correction = models.TextField(blank=True, default="")
    date_eval = models.DateTimeField(default=timezone.now)
    est_publiee = models.BooleanField(default=False)
    date_publication = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.CheckConstraint(condition=models.Q(note__gte=0) & models.Q(note__lte=20), name="ck_note_0_20"),
        ]


class SujetFinStage(models.Model):
    STATUT_PROPOSE = "PROPOSE"
    STATUT_VALIDE = "VALIDE"
    STATUT_ANNULE = "ANNULE"
    STATUT_CHOICES = [
        (STATUT_PROPOSE, "Propose"),
        (STATUT_VALIDE, "Valide"),
        (STATUT_ANNULE, "Annule"),
    ]

    id_sujet = models.CharField(max_length=50, primary_key=True, default=generate_id, editable=False)
    titre = models.CharField(max_length=255)
    description = models.TextField(blank=True, default="")
    specialite = models.ForeignKey(
        Specialite,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="sujets_fin_stage",
    )
    cree_par = models.ForeignKey(get_user_model(), on_delete=models.PROTECT, related_name="sujets_crees")
    date_creation = models.DateTimeField(default=timezone.now)
    statut = models.CharField(max_length=30, choices=STATUT_CHOICES, default=STATUT_PROPOSE)
    fichier_pdf = models.BinaryField(null=True, blank=True)
    nom_fichier_pdf = models.CharField(max_length=255, blank=True, default="")
    mime_type_pdf = models.CharField(max_length=100, blank=True, default="")


class AffectationSujetStage(models.Model):
    ETAT_EN_COURS = "EN_COURS"
    ETAT_TERMINE = "TERMINE"
    ETAT_ABANDONNE = "ABANDONNE"
    ETAT_CHOICES = [
        (ETAT_EN_COURS, "En cours"),
        (ETAT_TERMINE, "Termine"),
        (ETAT_ABANDONNE, "Abandonne"),
    ]

    id_affectation_sujet = models.CharField(max_length=50, primary_key=True, default=generate_id, editable=False)
    sujet = models.ForeignKey(SujetFinStage, on_delete=models.CASCADE, related_name="affectations")
    stagiaire = models.OneToOneField(get_user_model(), on_delete=models.CASCADE, related_name="sujet_fin_stage")
    encadrant = models.ForeignKey(
        get_user_model(),
        on_delete=models.PROTECT,
        related_name="encadrements_sujet",
    )
    date_affectation = models.DateTimeField(default=timezone.now)
    etat = models.CharField(max_length=30, choices=ETAT_CHOICES, default=ETAT_EN_COURS)


class Notification(models.Model):
    id_notification = models.CharField(max_length=50, primary_key=True, default=generate_id, editable=False)
    destinataire = models.ForeignKey(
        get_user_model(),
        on_delete=models.CASCADE,
        related_name="notifications",
    )
    type_notification = models.CharField(max_length=50)
    titre = models.CharField(max_length=255)
    message = models.TextField()
    lien_cible = models.CharField(max_length=500, blank=True, default="")
    est_lue = models.BooleanField(default=False)
    date_creation = models.DateTimeField(default=timezone.now)
    date_lecture = models.DateTimeField(null=True, blank=True)


class FeuilleRedactionFichier(models.Model):
    id = models.CharField(max_length=50, primary_key=True, default=generate_id, editable=False)
    titre = models.CharField(max_length=255, blank=True, default="")
    nom_fichier = models.CharField(max_length=255, blank=True, default="")
    mime_type = models.CharField(max_length=100, blank=True, default="application/octet-stream")
    fichier = models.BinaryField(null=True, blank=True)
    uploaded_at = models.DateTimeField(default=timezone.now)
    uploaded_by = models.ForeignKey(get_user_model(), on_delete=models.SET_NULL, null=True, blank=True, related_name="feuilles_redaction_uploadees")

    def __str__(self):
        return self.titre or self.nom_fichier


class InstallationLogicielFichier(models.Model):
    id = models.CharField(max_length=50, primary_key=True, default=generate_id, editable=False)
    titre = models.CharField(max_length=255, blank=True, default="")
    nom_fichier = models.CharField(max_length=255, blank=True, default="")
    mime_type = models.CharField(max_length=100, blank=True, default="application/octet-stream")
    fichier = models.BinaryField(null=True, blank=True)
    uploaded_at = models.DateTimeField(default=timezone.now)
    uploaded_by = models.ForeignKey(get_user_model(), on_delete=models.SET_NULL, null=True, blank=True, related_name="installation_fichiers_uploades")

    def __str__(self):
        return self.titre or self.nom_fichier


class SujetFinStageFichier(models.Model):
    id = models.CharField(max_length=50, primary_key=True, default=generate_id, editable=False)
    titre = models.CharField(max_length=255, blank=True, default="")
    nom_fichier = models.CharField(max_length=255, blank=True, default="")
    mime_type = models.CharField(max_length=100, blank=True, default="application/vnd.openxmlformats-officedocument.wordprocessingml.document")
    fichier = models.BinaryField(null=True, blank=True)
    uploaded_at = models.DateTimeField(default=timezone.now)
    uploaded_by = models.ForeignKey(get_user_model(), on_delete=models.SET_NULL, null=True, blank=True, related_name="sujets_fichiers_uploades")

    def __str__(self):
        return self.titre or self.nom_fichier


class EventAudit(models.Model):
    id_event = models.CharField(max_length=50, primary_key=True, default=generate_id, editable=False)
    actor = models.ForeignKey(
        get_user_model(),
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="events_audit",
    )
    actor_username = models.CharField(max_length=150, blank=True, default="")
    actor_role = models.CharField(max_length=32, blank=True, default="")
    event_type = models.CharField(max_length=80)
    target_type = models.CharField(max_length=80, blank=True, default="")
    target_id = models.CharField(max_length=80, blank=True, default="")
    message = models.CharField(max_length=255, blank=True, default="")
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        ordering = ["-created_at"]
