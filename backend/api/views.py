import base64
import csv
import io
import zipfile
import secrets
import string

from openpyxl import load_workbook
from django.contrib.auth import get_user_model
from django.core.mail import send_mail
from django.conf import settings as django_settings
from django.core.files.base import ContentFile
from django.db import IntegrityError
from django.db import models
from django.db.models import Q
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from .models import (
    AffectationSujetStage,
    Brochure,
    Controle,
    ControleCorrection,
    Corps,
    Cours,
    CoursFichier,
    Evaluation,
    EventAudit,
    FeuilleRedactionFichier,
    FichierRenseignementTemplate,
    InstallationLogicielFichier,
    Inscription,
    Matiere,
    Module,
    Notification,
    Rank,
    Specialite,
    Speciality,
    SoumissionControle,
    SujetFinStage,
    SujetFinStageFichier,
    UserProfile,
)


def _coerce_bulk_row(row):
    normalized = {}
    for key, value in (row or {}).items():
        if key is None:
            continue
        normalized[str(key).strip().lower()] = "" if value is None else str(value).strip()
    return normalized


def _parse_bulk_csv_text(csv_text):
    cleaned = (csv_text or "").replace("\r\n", "\n").replace("\r", "\n").lstrip("\ufeff")
    if not cleaned.strip():
        return []
    first_line = cleaned.split("\n", 1)[0]
    delimiter = ";" if first_line.count(";") > first_line.count(",") else ","
    reader = csv.DictReader(io.StringIO(cleaned), delimiter=delimiter)
    if not reader.fieldnames:
        return []
    reader.fieldnames = [str(field).strip() for field in reader.fieldnames]
    return [_coerce_bulk_row(row) for row in reader]


def _parse_bulk_import_rows(payload):
    if payload is None:
        return []
    if isinstance(payload, str):
        return _parse_bulk_csv_text(payload)
    if hasattr(payload, "read"):
        file_name = str(getattr(payload, "name", "")).lower()
        content = payload.read()
        if file_name.endswith((".xlsx", ".xlsm")):
            workbook = load_workbook(filename=io.BytesIO(content), read_only=True, data_only=True)
            if not workbook.worksheets:
                return []
            rows = list(workbook.worksheets[0].iter_rows(values_only=True))
            if not rows:
                return []
            headers = [str(cell).strip() for cell in rows[0]]
            return [
                _coerce_bulk_row(dict(zip(headers, row)))
                for row in rows[1:]
                if any(cell is not None and str(cell).strip() for cell in row)
            ]
        return _parse_bulk_csv_text(content.decode("utf-8-sig", errors="replace"))
    return []


def resolve_reference_entities(corps_id, rank_id, speciality_id):
    corps = Corps.objects.filter(id_corps=corps_id).first() if corps_id else None
    rank = Rank.objects.filter(id_rank=rank_id).first() if rank_id else None
    speciality = Speciality.objects.filter(id_speciality=speciality_id).first() if speciality_id else None
    if corps_id and not corps:
        return None, None, None, Response({"detail": "corps not found"}, status=status.HTTP_400_BAD_REQUEST)
    if rank_id and not rank:
        return None, None, None, Response({"detail": "rank not found"}, status=status.HTTP_400_BAD_REQUEST)
    if speciality_id and not speciality:
        return None, None, None, Response({"detail": "speciality not found"}, status=status.HTTP_400_BAD_REQUEST)
    if corps and rank and rank.corps_id != corps.id_corps:
        return None, None, None, Response({"detail": "rank does not belong to selected corps"}, status=status.HTTP_400_BAD_REQUEST)
    if corps and speciality and speciality.corps_id and speciality.corps_id != corps.id_corps:
        return None, None, None, Response({"detail": "speciality does not belong to selected corps"}, status=status.HTTP_400_BAD_REQUEST)
    return corps, rank, speciality, None


def validate_profile_requirements(role, matricule, est_civil, corps_id, rank_id, speciality_id):
    if role != UserProfile.ROLE_INSTRUCTEUR and est_civil:
        return Response({"detail": "Only instructeur can be civil"}, status=status.HTTP_400_BAD_REQUEST)

    # Admin is a system role — corps/matricule not required
    if role == UserProfile.ROLE_ADMIN:
        return None

    requires_military_profile = not (role == UserProfile.ROLE_INSTRUCTEUR and est_civil)
    if requires_military_profile and not matricule:
        return Response({"detail": "matricule is required for military roles"}, status=status.HTTP_400_BAD_REQUEST)
    if requires_military_profile and not corps_id:
        return Response(
            {"detail": "corps is required for military roles"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    return None


def log_event(
    *,
    request,
    event_type,
    target_type="",
    target_id="",
    message="",
    metadata=None,
):
    actor = getattr(request, "user", None)
    actor_profile = getattr(actor, "profile", None) if actor and getattr(actor, "is_authenticated", False) else None
    EventAudit.objects.create(
        actor=actor if actor and getattr(actor, "is_authenticated", False) else None,
        actor_username=getattr(actor, "username", "") if actor and getattr(actor, "is_authenticated", False) else "",
        actor_role=getattr(actor_profile, "role", "") if actor_profile else "",
        event_type=event_type,
        target_type=target_type,
        target_id=str(target_id) if target_id else "",
        message=message,
        metadata=metadata or {},
    )
 

def ensure_reference_manager(profile):
    if profile.role != UserProfile.ROLE_ADMIN:
        return Response({"detail": "Forbidden for this role"}, status=status.HTTP_403_FORBIDDEN)
    return None


def notify_stagiaires_correction_published(controle, correction):
    """Notify every stagiaire who submitted to this contrôle that the correction is available."""
    stagiaire_ids = (
        SoumissionControle.objects.filter(controle=controle)
        .values_list("stagiaire_id", flat=True)
        .distinct()
    )
    titre = f"Correction disponible : {controle.nom}"
    version_label = f" (version {correction.version_no})" if correction.version_no > 1 else ""
    correction_titre = f" — {correction.titre}" if correction.titre else ""
    message = (
        f"Le Service pédagogique a publié la correction{version_label}{correction_titre} "
        f"pour le contrôle « {controle.nom} » (cours : {controle.cours.titre})."
    )
    Notification.objects.bulk_create([
        Notification(
            destinataire_id=uid,
            type_notification="correction_publiee",
            titre=titre,
            message=message,
            lien_cible=f"/controles/{controle.id_controle}",
        )
        for uid in stagiaire_ids
    ])


def notify_stagiaires_new_cours(cours):
    """Create a notification for every stagiaire when a cours is published."""
    User = get_user_model()
    stagiaire_ids = (
        UserProfile.objects.filter(role=UserProfile.ROLE_STAGIAIRE)
        .values_list("user_id", flat=True)
    )
    matiere_label = cours.matiere.nom if cours.matiere else ""
    module_label = cours.module.nom if cours.module else ""
    context = " — ".join(filter(None, [module_label, matiere_label]))
    titre = f"Nouveau cours : {cours.titre}"
    message = (
        f"L'instructeur {cours.instructeur.username} a publié un nouveau cours"
        + (f" dans {context}" if context else "")
        + "."
    )
    Notification.objects.bulk_create([
        Notification(
            destinataire_id=uid,
            type_notification="nouveau_cours",
            titre=titre,
            message=message,
            lien_cible=f"/cours/{cours.id_cours}",
        )
        for uid in stagiaire_ids
    ])


class HealthView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"status": "ok"})


class PublicReferenceDataView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return Response(
            {
                "corps": [{"id": c.id_corps, "code": c.code, "label": c.label} for c in Corps.objects.all().order_by("label")],
                "ranks": [
                    {"id": r.id_rank, "code": r.code, "label": r.label, "corps_id": r.corps_id}
                    for r in Rank.objects.select_related("corps").all().order_by("corps__label", "label")
                ],
                "specialities": [
                    {"id": s.id_speciality, "code": s.code, "label": s.label, "corps_id": s.corps_id}
                    for s in Speciality.objects.select_related("corps").all().order_by("corps__label", "label")
                ],
            }
        )


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        profile, created = UserProfile.objects.get_or_create(user=user)
        if created and user.is_superuser:
            profile.role = UserProfile.ROLE_ADMIN
            profile.save(update_fields=["role"])
        return Response(
            {
                "id": user.id,
                "username": user.username,
                "email": user.email,
                "role": profile.role,
                "matricule": profile.matricule,
                "est_civil": profile.est_civil,
                "corps": {"id": profile.corps_id, "label": profile.corps.label} if profile.corps else None,
                "rank": {"id": profile.rank_id, "label": profile.rank.label} if profile.rank else None,
                "speciality": {"id": profile.speciality_id, "label": profile.speciality.label} if profile.speciality else None,
            }
        )


class SignupView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        username = request.data.get("username")
        password = request.data.get("password")
        email = request.data.get("email", "")
        role = request.data.get("role", UserProfile.ROLE_STAGIAIRE)
        matricule = (request.data.get("matricule") or "").strip()
        est_civil = bool(request.data.get("est_civil", False))
        corps_id = request.data.get("corps_id")
        rank_id = None
        speciality_id = None

        if not username or not password:
            return Response(
                {"detail": "username and password are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        valid_roles = {choice[0] for choice in UserProfile.ROLE_CHOICES}
        if role not in valid_roles:
            return Response(
                {"detail": "Invalid role"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if role == UserProfile.ROLE_ADMIN:
            return Response(
                {"detail": "Admin profile cannot be created from signup"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        validation_error = validate_profile_requirements(role, matricule, est_civil, corps_id, rank_id, speciality_id)
        if validation_error:
            return validation_error

        corps, rank, speciality, references_error = resolve_reference_entities(corps_id, rank_id, speciality_id)
        if references_error:
            return references_error

        user_model = get_user_model()
        try:
            user = user_model.objects.create_user(
                username=username,
                password=password,
                email=email,
            )
        except IntegrityError:
            return Response(
                {"detail": "Username already exists"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        UserProfile.objects.create(
            user=user,
            role=role,
            matricule=matricule,
            est_civil=est_civil,
            corps=corps,
            rank=rank,
            speciality=speciality,
        )
        log_event(
            request=request,
            event_type="signup.created",
            target_type="user",
            target_id=user.id,
            message=f"Signup created user {user.username}",
            metadata={"role": role, "est_civil": est_civil},
        )
        return Response(
            {
                "id": user.id,
                "username": user.username,
                "email": user.email,
                "role": role,
                "matricule": matricule,
                "est_civil": est_civil,
                "corps_id": corps.id_corps if corps else None,
                "rank_id": rank.id_rank if rank else None,
                "speciality_id": speciality.id_speciality if speciality else None,
            },
            status=status.HTTP_201_CREATED,
        )


class InstructeurDashboardView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        if profile.role != UserProfile.ROLE_INSTRUCTEUR:
            return Response({"detail": "Forbidden for this role"}, status=status.HTTP_403_FORBIDDEN)

        User = get_user_model()
        cours_queryset = Cours.objects.filter(instructeur=request.user)
        controles_queryset = Controle.objects.filter(instructeur=request.user)
        pending_corrections = SoumissionControle.objects.filter(
            controle__instructeur=request.user
        ).filter(evaluation__isnull=True)
        sujets = AffectationSujetStage.objects.filter(encadrant=request.user)
        unread_notifications = Notification.objects.filter(destinataire=request.user, est_lue=False)
        stagiaires = User.objects.filter(profile__role=UserProfile.ROLE_STAGIAIRE, is_active=True).select_related("profile")

        return Response(
            {
                "role": profile.role,
                "cours": {
                    "total": cours_queryset.count(),
                    "published": cours_queryset.filter(statut=Cours.STATUT_PUBLIE).count(),
                },
                "cours_list": [
                    {"id": c.id_cours, "title": c.titre, "status": c.statut}
                    for c in cours_queryset.order_by("-date_depot")[:20]
                ],
                "controles": {
                    "total": controles_queryset.count(),
                    "published": controles_queryset.filter(statut=Controle.STATUT_PUBLIE).count(),
                    "pending_corrections": pending_corrections.count(),
                },
                "controles_list": [
                    {
                        "id": c.id_controle,
                        "name": c.nom,
                        "status": c.statut,
                        "cours_title": c.cours.titre,
                        "deadline": c.date_limite,
                    }
                    for c in controles_queryset.select_related("cours").order_by("-id_controle")[:20]
                ],
                "pending_submissions": [
                    {
                        "soumission_id": s.id_soumission,
                        "controle_id": s.controle_id,
                        "controle_name": s.controle.nom,
                        "stagiaire_id": s.stagiaire_id,
                        "submitted_at": s.date_soumission,
                    }
                    for s in pending_corrections.select_related("controle").order_by("-date_soumission")[:20]
                ],
                "sujets_fin_stage": {
                    "total": sujets.count(),
                    "active": sujets.filter(etat=AffectationSujetStage.ETAT_EN_COURS).count(),
                    "list": [
                        {
                            "sujet_id": s.sujet.id_sujet,
                            "sujet": s.sujet.titre,
                            "description": s.sujet.description,
                            "stagiaire_id": s.stagiaire_id,
                            "stagiaire_username": s.stagiaire.username,
                            "etat": s.etat,
                        }
                        for s in sujets.select_related("sujet", "stagiaire").order_by("-date_affectation")[:20]
                    ],
                },
                "stagiaires_list": [
                    {"id": u.id, "username": u.username}
                    for u in stagiaires.order_by("username")
                ],
                "notifications": {
                    "unread_count": unread_notifications.count(),
                    "latest": [
                        {
                            "id": n.id_notification,
                            "title": n.titre,
                            "message": n.message,
                            "type": n.type_notification,
                            "created_at": n.date_creation,
                        }
                        for n in unread_notifications.order_by("-date_creation")[:10]
                    ],
                },
            }
        )


class StageaireDashboardView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        if profile.role != UserProfile.ROLE_STAGIAIRE:
            return Response({"detail": "Forbidden for this role"}, status=status.HTTP_403_FORBIDDEN)

        controle_ids = Controle.objects.filter(statut=Controle.STATUT_PUBLIE)
        soumissions = SoumissionControle.objects.filter(stagiaire=request.user).select_related("controle")
        notes = Evaluation.objects.filter(
            soumission__stagiaire=request.user,
            est_publiee=True,
        ).select_related("soumission", "soumission__controle")
        unread_notifications = Notification.objects.filter(destinataire=request.user, est_lue=False)

        cours_publies = Cours.objects.filter(statut=Cours.STATUT_PUBLIE).select_related("instructeur__profile", "specialite")

        sujet_affectation = AffectationSujetStage.objects.filter(stagiaire=request.user).select_related("sujet", "encadrant").first()

        # Build soumissions with correction info
        soumissions_detail = []
        for s in soumissions.select_related("controle").order_by("-date_soumission")[:20]:
            latest_correction = s.controle.corrections.order_by("-version_no").first()
            eval_obj = getattr(s, "evaluation", None)
            soumissions_detail.append({
                "soumission_id": s.id_soumission,
                "controle_id": s.controle_id,
                "controle_name": s.controle.nom,
                "statut": s.statut,
                "submitted_at": s.date_soumission,
                "has_fichier": bool(s.fichier_reponse),
                "note": str(eval_obj.note) if eval_obj and eval_obj.est_publiee else None,
                "correction_publiee": latest_correction.texte_correction if latest_correction else None,
                "correction_titre": latest_correction.titre if latest_correction else None,
            })

        return Response(
            {
                "role": profile.role,
                "cours_list": [
                    {
                        "id": c.id_cours,
                        "titre": c.titre,
                        "matiere": c.specialite.libelle if c.specialite else c.titre,
                        "description": c.description,
                        "instructeur": c.instructeur.username,
                        "controles_count": c.controles.filter(statut=Controle.STATUT_PUBLIE).count(),
                    }
                    for c in cours_publies.order_by("-date_depot")[:30]
                ],
                "modules_list": [
                    {
                        "id": m.id_module,
                        "nom": m.nom,
                        "matieres": [
                            {
                                "id": mat.id_matiere,
                                "nom": mat.nom,
                                "cours_count": mat.cours.filter(statut=Cours.STATUT_PUBLIE).count(),
                            }
                            for mat in m.matieres.all()
                        ],
                    }
                    for m in Module.objects.prefetch_related("matieres").all()
                ],
                "controls": {
                    "available_count": controle_ids.count(),
                    "submitted_count": soumissions.count(),
                    "pending_count": max(controle_ids.count() - soumissions.count(), 0),
                },
                "controls_list": [
                    {
                        "id": c.id_controle,
                        "name": c.nom,
                        "deadline": c.date_limite,
                        "cours": c.cours.titre,
                        "enonce": c.enonce,
                        "bareme": str(c.bareme),
                        "has_fichier_enonce": bool(c.fichier_enonce),
                    }
                    for c in controle_ids.select_related("cours").order_by("date_limite")[:20]
                ],
                "submitted_control_ids": list(soumissions.values_list("controle_id", flat=True)),
                "soumissions_detail": soumissions_detail,
                "notes": [
                    {
                        "controle": note.soumission.controle.nom,
                        "note": note.note,
                        "published_at": note.date_publication,
                    }
                    for note in notes.order_by("-date_publication")[:20]
                ],
                "sujet_fin_stage": {
                    "sujet_id": sujet_affectation.sujet.id_sujet if sujet_affectation else None,
                    "titre": sujet_affectation.sujet.titre if sujet_affectation else None,
                    "description": sujet_affectation.sujet.description if sujet_affectation else None,
                    "etat": sujet_affectation.etat if sujet_affectation else None,
                    "encadrant": sujet_affectation.encadrant.username if sujet_affectation else None,
                    "date_affectation": sujet_affectation.date_affectation if sujet_affectation else None,
                } if sujet_affectation else None,
                "notifications": {
                    "unread_count": unread_notifications.count(),
                    "latest": [
                        {
                            "id": n.id_notification,
                            "title": n.titre,
                            "message": n.message,
                            "type": n.type_notification,
                            "created_at": n.date_creation,
                        }
                        for n in unread_notifications.order_by("-date_creation")[:10]
                    ],
                },
            }
        )


class CoordinateurDashboardView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        if profile.role != UserProfile.ROLE_COORDINATEUR:
            return Response({"detail": "Forbidden for this role"}, status=status.HTTP_403_FORBIDDEN)

        User = get_user_model()
        stagiaires = User.objects.filter(profile__role=UserProfile.ROLE_STAGIAIRE)
        instructeurs = User.objects.filter(profile__role=UserProfile.ROLE_INSTRUCTEUR)

        stag_avgs = (
            Evaluation.objects.filter(est_publiee=True)
            .values("soumission__stagiaire_id")
            .annotate(avg=models.Avg("note"))
        )
        avg_by_stag = {row["soumission__stagiaire_id"]: float(row["avg"]) for row in stag_avgs}
        avec_note_ids = set(avg_by_stag.keys())
        reussite_ids = {sid for sid, avg in avg_by_stag.items() if avg >= 10}
        global_notes_avg = Evaluation.objects.filter(est_publiee=True).aggregate(avg=models.Avg("note"))["avg"]
        global_taux = round(len(reussite_ids) / len(avec_note_ids) * 100, 1) if avec_note_ids else None

        soumissions_by_stag = (
            SoumissionControle.objects.values("stagiaire_id").annotate(cnt=models.Count("id_soumission"))
        )
        soum_count_map = {row["stagiaire_id"]: row["cnt"] for row in soumissions_by_stag}

        affectations = AffectationSujetStage.objects.select_related("sujet", "encadrant").all()
        affectation_map = {a.stagiaire_id: a for a in affectations}

        stagiaires_detail = []
        for s in stagiaires.order_by("username"):
            aff = affectation_map.get(s.id)
            stagiaires_detail.append({
                "id": s.id,
                "username": s.username,
                "soumissions_count": soum_count_map.get(s.id, 0),
                "notes_avg": round(avg_by_stag[s.id], 2) if s.id in avg_by_stag else None,
                "encadrant_id": aff.encadrant_id if aff else None,
                "encadrant": aff.encadrant.username if aff else None,
                "sujet_titre": aff.sujet.titre if aff else None,
            })

        # Per-module stats
        modules = Module.objects.prefetch_related("matieres__cours__controles").order_by("ordre", "nom")
        par_module = []
        for m in modules:
            cours_ids = list(Cours.objects.filter(module=m).values_list("id_cours", flat=True))
            ctrl_ids = list(Controle.objects.filter(cours_id__in=cours_ids).values_list("id_controle", flat=True))
            avg_mod = (
                Evaluation.objects.filter(est_publiee=True, soumission__controle_id__in=ctrl_ids)
                .aggregate(avg=models.Avg("note"))["avg"]
            )
            par_module.append({
                "module": m.nom,
                "cours_count": len(cours_ids),
                "controls_count": len(ctrl_ids),
                "notes_avg": round(float(avg_mod), 2) if avg_mod is not None else None,
            })

        return Response(
            {
                "role": profile.role,
                "monitoring": {
                    "controls_total": Controle.objects.count(),
                    "controls_published": Controle.objects.filter(statut=Controle.STATUT_PUBLIE).count(),
                    "notes_published": Evaluation.objects.filter(est_publiee=True).count(),
                    "soumissions_total": SoumissionControle.objects.count(),
                    "taux_reussite_global": global_taux,
                    "avancement_moyen": round(float(global_notes_avg), 2) if global_notes_avg is not None else None,
                    "stagiaires_total": stagiaires.count(),
                },
                "stagiaires_detail": stagiaires_detail,
                "instructeurs_list": [
                    {"id": u.id, "username": u.username} for u in instructeurs.order_by("username")
                ],
                "par_module": par_module,
                "notifications": {
                    "unread_count": Notification.objects.filter(destinataire=request.user, est_lue=False).count(),
                },
            }
        )


class CoordinateurReportExportView(APIView):
    permission_classes = [IsAuthenticated]

    def _build_rows(self):
        User = get_user_model()
        stagiaires = User.objects.filter(profile__role=UserProfile.ROLE_STAGIAIRE).order_by("username")
        stag_avgs = (
            Evaluation.objects.filter(est_publiee=True)
            .values("soumission__stagiaire_id")
            .annotate(avg=models.Avg("note"))
        )
        avg_by_stag = {row["soumission__stagiaire_id"]: float(row["avg"]) for row in stag_avgs}
        soumissions_by_stag = (
            SoumissionControle.objects.values("stagiaire_id").annotate(cnt=models.Count("id_soumission"))
        )
        soum_map = {row["stagiaire_id"]: row["cnt"] for row in soumissions_by_stag}
        aff_map = {a.stagiaire_id: a for a in AffectationSujetStage.objects.select_related("encadrant", "sujet").all()}
        rows = []
        for s in stagiaires:
            aff = aff_map.get(s.id)
            avg = avg_by_stag.get(s.id)
            rows.append([
                s.username,
                soum_map.get(s.id, 0),
                round(avg, 2) if avg is not None else "",
                "Réussi" if avg is not None and avg >= 10 else ("Échec" if avg is not None else "—"),
                aff.encadrant.username if aff else "",
                aff.sujet.titre if aff else "",
            ])
        return rows

    def get(self, request):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        if profile.role != UserProfile.ROLE_COORDINATEUR:
            return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

        fmt = request.query_params.get("fmt", "csv")
        headers = ["Stagiaire", "Soumissions", "Moyenne (/20)", "Statut", "Encadrant", "Sujet fin de stage"]
        rows = self._build_rows()

        if fmt == "xlsx":
            return self._export_xlsx(headers, rows)
        return self._export_csv(headers, rows)

    def _export_csv(self, headers, rows):
        import csv
        from django.http import HttpResponse
        response = HttpResponse(content_type="text/csv; charset=utf-8-sig")
        response["Content-Disposition"] = 'attachment; filename="rapport_coordinateur.csv"'
        writer = csv.writer(response)
        writer.writerow(headers)
        for r in rows:
            writer.writerow(r)
        return response

    def _export_xlsx(self, headers, rows):
        import io
        from django.http import HttpResponse
        try:
            import openpyxl
            from openpyxl.styles import Font, PatternFill, Alignment
        except ImportError:
            return self._export_csv(headers, rows)

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Rapport Coordinateur"
        ws.append(headers)
        for cell in ws[1]:
            cell.font = Font(bold=True, color="FFFFFF")
            cell.fill = PatternFill(start_color="15173D", end_color="15173D", fill_type="solid")
            cell.alignment = Alignment(horizontal="center")
        for r in rows:
            ws.append(r)
        for col in ws.columns:
            max_len = max((len(str(c.value)) for c in col if c.value is not None), default=10)
            ws.column_dimensions[col[0].column_letter].width = max_len + 4

        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)
        response = HttpResponse(buf.read(), content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        response["Content-Disposition"] = 'attachment; filename="rapport_coordinateur.xlsx"'
        return response


class CoordinateurAssignStagiaireView(APIView):
    """Coordinateur assigns a stagiaire to an instructeur (creates sujet + affectation)."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        if profile.role != UserProfile.ROLE_COORDINATEUR:
            return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

        User = get_user_model()
        stagiaire_id = request.data.get("stagiaire_id")
        instructeur_id = request.data.get("instructeur_id")
        sujet_titre = (request.data.get("sujet_titre") or "").strip() or "Sujet fin de stage"

        stagiaire = User.objects.filter(id=stagiaire_id, profile__role=UserProfile.ROLE_STAGIAIRE).first()
        if not stagiaire:
            return Response({"detail": "Stagiaire introuvable"}, status=status.HTTP_404_NOT_FOUND)

        instructeur = User.objects.filter(id=instructeur_id, profile__role=UserProfile.ROLE_INSTRUCTEUR).first()
        if not instructeur:
            return Response({"detail": "Instructeur introuvable"}, status=status.HTTP_404_NOT_FOUND)

        existing = AffectationSujetStage.objects.filter(stagiaire=stagiaire).first()
        if existing:
            existing.encadrant = instructeur
            existing.save(update_fields=["encadrant"])
            existing.sujet.titre = sujet_titre
            existing.sujet.save(update_fields=["titre"])
            return Response({"detail": "Affectation mise à jour."}, status=status.HTTP_200_OK)

        sujet = SujetFinStage.objects.create(
            titre=sujet_titre,
            cree_par=instructeur,
            statut=SujetFinStage.STATUT_VALIDE,
        )
        AffectationSujetStage.objects.create(
            sujet=sujet,
            stagiaire=stagiaire,
            encadrant=instructeur,
        )
        return Response({"detail": "Stagiaire assigné."}, status=status.HTTP_201_CREATED)

    def delete(self, request):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        if profile.role != UserProfile.ROLE_COORDINATEUR:
            return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

        stagiaire_id = request.data.get("stagiaire_id")
        aff = AffectationSujetStage.objects.filter(stagiaire_id=stagiaire_id).first()
        if not aff:
            return Response({"detail": "Aucune affectation."}, status=status.HTTP_404_NOT_FOUND)
        sujet = aff.sujet
        aff.delete()
        sujet.delete()
        return Response({"detail": "Affectation supprimée."}, status=status.HTTP_200_OK)


class StageaireFichierRenseignementView(APIView):
    """Stagiaire uploads/downloads/deletes their own fichier de renseignement."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        if profile.role != UserProfile.ROLE_STAGIAIRE:
            return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)
        if request.query_params.get("status") == "1":
            return Response({
                "has_fichier": bool(profile.fichier_renseignement),
                "nom_fichier": profile.nom_fichier_renseignement or "",
            })
        if not profile.fichier_renseignement:
            return Response({"detail": "no file"}, status=status.HTTP_404_NOT_FOUND)
        return Response({
            "nom_fichier": profile.nom_fichier_renseignement,
            "mime_type": profile.mime_type_renseignement,
            "fichier_base64": base64.b64encode(bytes(profile.fichier_renseignement)).decode(),
        })

    def post(self, request):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        if profile.role != UserProfile.ROLE_STAGIAIRE:
            return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)
        fichier_base64 = request.data.get("fichier_base64")
        nom_fichier = request.data.get("nom_fichier", "fichier-renseignement")
        mime_type = request.data.get("mime_type", "application/octet-stream")
        if not fichier_base64:
            return Response({"detail": "fichier_base64 required"}, status=status.HTTP_400_BAD_REQUEST)
        profile.fichier_renseignement = base64.b64decode(fichier_base64)
        profile.nom_fichier_renseignement = nom_fichier
        profile.mime_type_renseignement = mime_type
        profile.save(update_fields=["fichier_renseignement", "nom_fichier_renseignement", "mime_type_renseignement"])
        return Response({"detail": "uploaded"})

    def delete(self, request):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        if profile.role != UserProfile.ROLE_STAGIAIRE:
            return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)
        profile.fichier_renseignement = None
        profile.nom_fichier_renseignement = ""
        profile.mime_type_renseignement = ""
        profile.save(update_fields=["fichier_renseignement", "nom_fichier_renseignement", "mime_type_renseignement"])
        return Response({"detail": "deleted"})


class AdminFichierTemplateView(APIView):
    """Admin sets/gets the global fichier de renseignement template document."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        if profile.role != UserProfile.ROLE_ADMIN:
            return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)
        tpl = FichierRenseignementTemplate.objects.first()
        if not tpl or not tpl.fichier:
            if request.query_params.get("download") == "1":
                return Response({"detail": "no template"}, status=status.HTTP_404_NOT_FOUND)
            return Response({"has_template": False, "nom_fichier": ""})
        if request.query_params.get("download") == "1":
            return Response({
                "nom_fichier": tpl.nom_fichier,
                "mime_type": tpl.mime_type,
                "fichier_base64": base64.b64encode(bytes(tpl.fichier)).decode(),
            })
        return Response({"has_template": True, "nom_fichier": tpl.nom_fichier})

    def post(self, request):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        if profile.role != UserProfile.ROLE_ADMIN:
            return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)
        fichier_base64 = request.data.get("fichier_base64")
        nom_fichier = request.data.get("nom_fichier", "fichier-renseignement")
        mime_type = request.data.get("mime_type", "application/octet-stream")
        if not fichier_base64:
            return Response({"detail": "fichier_base64 required"}, status=status.HTTP_400_BAD_REQUEST)
        tpl = FichierRenseignementTemplate.objects.first()
        if not tpl:
            tpl = FichierRenseignementTemplate()
        tpl.fichier = base64.b64decode(fichier_base64)
        tpl.nom_fichier = nom_fichier
        tpl.mime_type = mime_type
        tpl.save()
        return Response({"detail": "uploaded"})


class StageaireDownloadFichierTemplateView(APIView):
    """Stagiaire downloads the admin-set fichier de renseignement template."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        if profile.role != UserProfile.ROLE_STAGIAIRE:
            return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)
        tpl = FichierRenseignementTemplate.objects.first()
        if not tpl or not tpl.fichier:
            return Response({"detail": "no template"}, status=status.HTTP_404_NOT_FOUND)
        return Response({
            "nom_fichier": tpl.nom_fichier,
            "mime_type": tpl.mime_type,
            "fichier_base64": base64.b64encode(bytes(tpl.fichier)).decode(),
        })


class AdminFichiersRenseignementView(APIView):
    """List all fichiers de renseignement uploaded by stagiaires, or download one."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        if profile.role != UserProfile.ROLE_ADMIN:
            return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

        stagiaire_id = request.query_params.get("stagiaire_id")
        if stagiaire_id:
            try:
                sp = UserProfile.objects.select_related("user").get(
                    user_id=stagiaire_id, role=UserProfile.ROLE_STAGIAIRE
                )
            except UserProfile.DoesNotExist:
                return Response({"detail": "not found"}, status=status.HTTP_404_NOT_FOUND)
            if not sp.fichier_renseignement:
                return Response({"detail": "no file"}, status=status.HTTP_404_NOT_FOUND)
            return Response({
                "nom_fichier": sp.nom_fichier_renseignement,
                "mime_type": sp.mime_type_renseignement,
                "fichier_base64": base64.b64encode(bytes(sp.fichier_renseignement)).decode(),
            })

        stagiaires = UserProfile.objects.select_related("user").filter(role=UserProfile.ROLE_STAGIAIRE)
        return Response([
            {
                "stagiaire_id": sp.user_id,
                "stagiaire_username": sp.user.username,
                "nom_fichier": sp.nom_fichier_renseignement or "",
                "has_fichier": bool(sp.fichier_renseignement),
            }
            for sp in stagiaires
        ])


class AdminDashboardView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        if profile.role != UserProfile.ROLE_ADMIN:
            return Response({"detail": "Forbidden for this role"}, status=status.HTTP_403_FORBIDDEN)

        users = get_user_model().objects.select_related("profile").all().order_by("username")
        return Response(
            {
                "role": profile.role,
                "platform": {
                    "users_total": get_user_model().objects.count(),
                    "users_active": get_user_model().objects.filter(is_active=True).count(),
                    "cours_total": Cours.objects.count(),
                    "controles_total": Controle.objects.count(),
                    "soumissions_total": SoumissionControle.objects.count(),
                },
                "users": [
                    {
                        "id": u.id,
                        "username": u.username,
                        "email": u.email,
                        "matricule": getattr(getattr(u, "profile", None), "matricule", ""),
                        "is_active": u.is_active,
                        "role": getattr(getattr(u, "profile", None), "role", ""),
                    }
                    for u in users
                ],
            }
        )


class AdminToggleUserStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, user_id):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        if profile.role != UserProfile.ROLE_ADMIN:
            return Response({"detail": "Forbidden for this role"}, status=status.HTTP_403_FORBIDDEN)

        user_model = get_user_model()
        target = user_model.objects.filter(id=user_id).first()
        if not target:
            return Response({"detail": "user not found"}, status=status.HTTP_404_NOT_FOUND)
        if target.id == request.user.id:
            return Response({"detail": "cannot disable self"}, status=status.HTTP_400_BAD_REQUEST)

        target.is_active = not target.is_active
        target.save(update_fields=["is_active"])
        log_event(
            request=request,
            event_type="admin.user.toggled",
            target_type="user",
            target_id=target.id,
            message=f"Admin toggled active status for {target.username}",
            metadata={"is_active": target.is_active},
        )
        return Response({"id": target.id, "is_active": target.is_active})


class AdminCreateAccountView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        permission_error = ensure_reference_manager(profile)
        if permission_error:
            return permission_error

        username = (request.data.get("username") or "").strip()
        email = (request.data.get("email") or "").strip()
        password = request.data.get("password")
        role = request.data.get("role")
        matricule = (request.data.get("matricule") or "").strip()
        est_civil = bool(request.data.get("est_civil", False))
        corps_id = request.data.get("corps_id")
        rank_id = request.data.get("rank_id")
        speciality_id = request.data.get("speciality_id")

        valid_roles = {choice[0] for choice in UserProfile.ROLE_CHOICES}
        if not username or not password or not role:
            return Response({"detail": "username, password and role are required"}, status=status.HTTP_400_BAD_REQUEST)
        if role not in valid_roles:
            return Response({"detail": "Invalid role"}, status=status.HTTP_400_BAD_REQUEST)
        validation_error = validate_profile_requirements(role, matricule, est_civil, corps_id, rank_id, speciality_id)
        if validation_error:
            return validation_error

        corps, rank, speciality, references_error = resolve_reference_entities(corps_id, rank_id, speciality_id)
        if references_error:
            return references_error

        user_model = get_user_model()
        if user_model.objects.filter(username=username).exists():
            return Response({"detail": "Username already exists"}, status=status.HTTP_400_BAD_REQUEST)

        user = user_model.objects.create_user(username=username, email=email, password=password)
        if role == UserProfile.ROLE_ADMIN:
            user.is_staff = True
            user.is_superuser = True
            user.save(update_fields=["is_staff", "is_superuser"])

        UserProfile.objects.create(
            user=user,
            role=role,
            matricule=matricule,
            est_civil=est_civil,
            corps=corps,
            rank=rank,
            speciality=speciality,
        )
        log_event(
            request=request,
            event_type="admin.account.created",
            target_type="user",
            target_id=user.id,
            message=f"Admin created account {user.username}",
            metadata={"role": role, "est_civil": est_civil},
        )
        return Response(
            {
                "id": user.id,
                "username": user.username,
                "password": password,
                "email": user.email,
                "role": role,
                "matricule": matricule,
                "est_civil": est_civil,
                "corps_id": corps.id_corps if corps else None,
                "rank_id": rank.id_rank if rank else None,
                "speciality_id": speciality.id_speciality if speciality else None,
            },
            status=status.HTTP_201_CREATED,
        )


class AdminResetUserPasswordView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, user_id):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        if profile.role != UserProfile.ROLE_ADMIN:
            return Response({"detail": "Forbidden for this role"}, status=status.HTTP_403_FORBIDDEN)

        new_password = (request.data.get("password") or "").strip()
        if not new_password:
            return Response({"detail": "password is required"}, status=status.HTTP_400_BAD_REQUEST)

        user_model = get_user_model()
        target = user_model.objects.filter(id=user_id).first()
        if not target:
            return Response({"detail": "user not found"}, status=status.HTTP_404_NOT_FOUND)

        target.set_password(new_password)
        target.save(update_fields=["password"])
        log_event(
            request=request,
            event_type="admin.user.password_reset",
            target_type="user",
            target_id=target.id,
            message=f"Admin reset password for {target.username}",
            metadata={},
        )
        return Response({"detail": "password updated"})


class AdminSendPasswordEmailView(APIView):
    """Generate a random password, set it, and email it to the user."""
    permission_classes = [IsAuthenticated]

    def post(self, request, user_id):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        if profile.role != UserProfile.ROLE_ADMIN:
            return Response({"detail": "Forbidden for this role"}, status=status.HTTP_403_FORBIDDEN)

        user_model = get_user_model()
        target = user_model.objects.filter(id=user_id).first()
        if not target:
            return Response({"detail": "user not found"}, status=status.HTTP_404_NOT_FOUND)

        if not target.email:
            return Response({"detail": "no_email"}, status=status.HTTP_400_BAD_REQUEST)

        # Generate a secure random password: 12 chars, mix of letters + digits + symbol
        alphabet = string.ascii_letters + string.digits + "!@#$%&"
        new_password = "".join(secrets.choice(alphabet) for _ in range(12))

        target.set_password(new_password)
        target.save(update_fields=["password"])

        subject = "Réinitialisation de votre mot de passe — PFS Platform"
        body = (
            f"Bonjour {target.username},\n\n"
            f"Votre mot de passe a été réinitialisé par un administrateur.\n\n"
            f"  Identifiant : {target.username}\n"
            f"  Nouveau mot de passe : {new_password}\n\n"
            f"Veuillez vous connecter et changer ce mot de passe dès que possible.\n\n"
            f"— Équipe PFS Platform"
        )

        try:
            send_mail(
                subject=subject,
                message=body,
                from_email=django_settings.DEFAULT_FROM_EMAIL,
                recipient_list=[target.email],
                fail_silently=False,
            )
        except Exception as exc:
            return Response({"detail": f"email_error: {exc}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        log_event(
            request=request,
            event_type="admin.user.password_reset_email",
            target_type="user",
            target_id=target.id,
            message=f"Admin sent password reset email for {target.username} to {target.email}",
            metadata={"email": target.email},
        )
        return Response({"detail": "email_sent", "email": target.email})


class AdminBulkCreateAccountsCsvView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        permission_error = ensure_reference_manager(profile)
        if permission_error:
            return permission_error

        csv_content = request.data.get("csv_content")
        uploaded_file = request.FILES.get("file") or request.FILES.get("csv_file") or request.FILES.get("excel_file")
        rows = _parse_bulk_import_rows(uploaded_file if uploaded_file else csv_content)
        if not rows:
            return Response({"detail": "csv_content or file is required"}, status=status.HTTP_400_BAD_REQUEST)

        expected = {"username", "email", "password", "role", "matricule", "est_civil", "corps_id", "rank_id", "speciality_id"}
        actual = {str(key).strip().lower() for key in rows[0].keys() if key is not None}
        missing = expected - actual
        extra = actual - expected
        if not actual or actual != expected:
            msg = "CSV headers must be: username,email,password,role,matricule,est_civil,corps_id,rank_id,speciality_id"
            if missing:
                msg += f" | Colonnes manquantes: {', '.join(sorted(missing))}"
            if extra:
                msg += f" | Colonnes inconnues: {', '.join(sorted(extra))}"
            return Response({"detail": msg}, status=status.HTTP_400_BAD_REQUEST)

        valid_roles = {choice[0] for choice in UserProfile.ROLE_CHOICES}
        user_model = get_user_model()
        created = []
        errors = []
        seen_emails = set()

        for idx, row in enumerate(rows, start=2):
            username = row.get("username", "")
            email = row.get("email", "")
            password = row.get("password", "")
            role = row.get("role", "")
            matricule = row.get("matricule", "")
            est_civil = row.get("est_civil", "").lower() in {"1", "true", "yes", "y"}
            corps_id = row.get("corps_id", "")
            rank_id = row.get("rank_id", "")
            speciality_id = row.get("speciality_id", "")

            if not username or not password or not role:
                errors.append({"line": idx, "error": "username, password and role are required"})
                continue
            if role not in valid_roles:
                errors.append({"line": idx, "error": "Invalid role"})
                continue
            validation_error = validate_profile_requirements(
                role=role,
                matricule=matricule,
                est_civil=est_civil,
                corps_id=corps_id,
                rank_id=rank_id,
                speciality_id=speciality_id,
            )
            if validation_error:
                errors.append({"line": idx, "error": validation_error.data.get("detail", "invalid profile data")})
                continue
            corps, rank, speciality, references_error = resolve_reference_entities(corps_id, rank_id, speciality_id)
            if references_error:
                errors.append({"line": idx, "error": references_error.data.get("detail", "invalid references")})
                continue
            if user_model.objects.filter(username=username).exists():
                errors.append({"line": idx, "error": "Username already exists"})
                continue
            email_key = email.casefold()
            if email_key and (email_key in seen_emails or user_model.objects.filter(email__iexact=email).exists()):
                errors.append({"line": idx, "error": "Email already exists"})
                continue
            if email_key:
                seen_emails.add(email_key)

            user = user_model.objects.create_user(username=username, email=email, password=password)
            if role == UserProfile.ROLE_ADMIN:
                user.is_staff = True
                user.is_superuser = True
                user.save(update_fields=["is_staff", "is_superuser"])
            UserProfile.objects.create(
                user=user,
                role=role,
                matricule=matricule,
                est_civil=est_civil,
                corps=corps,
                rank=rank,
                speciality=speciality,
            )
            created.append({"username": username, "role": role})

        if created or errors:
            log_event(
                request=request,
                event_type="admin.account.bulk_csv",
                target_type="users",
                message="Admin bulk account import",
                metadata={"created_count": len(created), "error_count": len(errors)},
            )

        return Response(
            {
                "created_count": len(created),
                "error_count": len(errors),
                "created": created,
                "errors": errors,
            },
            status=status.HTTP_201_CREATED if created else status.HTTP_400_BAD_REQUEST,
        )


class AdminReferenceDataView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        permission_error = ensure_reference_manager(profile)
        if permission_error:
            return permission_error
        return Response(
            {
                "corps": [{"id": c.id_corps, "code": c.code, "label": c.label} for c in Corps.objects.all().order_by("label")],
                "ranks": [
                    {"id": r.id_rank, "code": r.code, "label": r.label, "corps_id": r.corps_id}
                    for r in Rank.objects.select_related("corps").all().order_by("corps__label", "label")
                ],
                "specialities": [
                    {"id": s.id_speciality, "code": s.code, "label": s.label, "corps_id": s.corps_id}
                    for s in Speciality.objects.select_related("corps").all().order_by("corps__label", "label")
                ],
            }
        )


class AdminEventsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        if profile.role != UserProfile.ROLE_ADMIN:
            return Response({"detail": "Forbidden for this role"}, status=status.HTTP_403_FORBIDDEN)
        limit = int(request.query_params.get("limit", 100))
        limit = max(1, min(limit, 300))
        events = EventAudit.objects.all()[:limit]
        return Response(
            {
                "events": [
                    {
                        "id": event.id_event,
                        "created_at": event.created_at,
                        "actor_username": event.actor_username,
                        "actor_role": event.actor_role,
                        "event_type": event.event_type,
                        "target_type": event.target_type,
                        "target_id": event.target_id,
                        "message": event.message,
                        "metadata": event.metadata,
                    }
                    for event in events
                ]
            }
        )


class AdminCorpsView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        permission_error = ensure_reference_manager(profile)
        if permission_error:
            return permission_error
        code = (request.data.get("code") or "").strip()
        label = (request.data.get("label") or "").strip()
        if not code or not label:
            return Response({"detail": "code and label are required"}, status=status.HTTP_400_BAD_REQUEST)
        if Corps.objects.filter(models.Q(code__iexact=code) | models.Q(label__iexact=label)).exists():
            return Response({"detail": "corps already exists"}, status=status.HTTP_400_BAD_REQUEST)
        corps = Corps.objects.create(code=code, label=label)
        log_event(
            request=request,
            event_type="admin.reference.corps.created",
            target_type="corps",
            target_id=corps.id_corps,
            message=f"Admin created corps {corps.label}",
        )
        return Response({"id": corps.id_corps, "code": corps.code, "label": corps.label}, status=status.HTTP_201_CREATED)

    def patch(self, request, corps_id):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        permission_error = ensure_reference_manager(profile)
        if permission_error:
            return permission_error
        corps = Corps.objects.filter(id_corps=corps_id).first()
        if not corps:
            return Response({"detail": "corps not found"}, status=status.HTTP_404_NOT_FOUND)
        code = (request.data.get("code") or corps.code).strip()
        label = (request.data.get("label") or corps.label).strip()
        code_changed = code.lower() != corps.code.lower()
        label_changed = label.lower() != corps.label.lower()
        if code_changed and Corps.objects.exclude(pk=corps.pk).filter(code__iexact=code).exists():
            return Response({"detail": "Un corps avec ce code existe déjà."}, status=status.HTTP_400_BAD_REQUEST)
        if label_changed and Corps.objects.exclude(pk=corps.pk).filter(label__iexact=label).exists():
            return Response({"detail": "Un corps avec ce libellé existe déjà."}, status=status.HTTP_400_BAD_REQUEST)
        corps.code = code
        corps.label = label
        corps.save(update_fields=["code", "label"])
        log_event(
            request=request,
            event_type="admin.reference.corps.updated",
            target_type="corps",
            target_id=corps.id_corps,
            message=f"Admin updated corps {corps.label}",
        )
        return Response({"id": corps.id_corps, "code": corps.code, "label": corps.label})

    def delete(self, request, corps_id):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        permission_error = ensure_reference_manager(profile)
        if permission_error:
            return permission_error
        corps = Corps.objects.filter(id_corps=corps_id).first()
        if not corps:
            return Response({"detail": "corps not found"}, status=status.HTTP_404_NOT_FOUND)
        label = corps.label
        corps.delete()
        log_event(
            request=request,
            event_type="admin.reference.corps.deleted",
            target_type="corps",
            target_id=corps_id,
            message=f"Admin deleted corps {label}",
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class AdminRanksView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        if profile.role != UserProfile.ROLE_ADMIN:
            return Response({"detail": "Forbidden for this role"}, status=status.HTTP_403_FORBIDDEN)
        code = (request.data.get("code") or "").strip()
        label = (request.data.get("label") or "").strip()
        corps_id = request.data.get("corps_id")
        if not code or not label or not corps_id:
            return Response({"detail": "code, label and corps_id are required"}, status=status.HTTP_400_BAD_REQUEST)
        corps = Corps.objects.filter(id_corps=corps_id).first()
        if not corps:
            return Response({"detail": "corps not found"}, status=status.HTTP_400_BAD_REQUEST)
        if Rank.objects.filter(models.Q(code__iexact=code) | (models.Q(label__iexact=label) & models.Q(corps=corps))).exists():
            return Response({"detail": "rank already exists"}, status=status.HTTP_400_BAD_REQUEST)
        rank = Rank.objects.create(code=code, label=label, corps=corps)
        log_event(
            request=request,
            event_type="admin.reference.rank.created",
            target_type="rank",
            target_id=rank.id_rank,
            message=f"Admin created rank {rank.label}",
            metadata={"corps_id": rank.corps_id},
        )
        return Response(
            {"id": rank.id_rank, "code": rank.code, "label": rank.label, "corps_id": rank.corps_id},
            status=status.HTTP_201_CREATED,
        )

    def patch(self, request, rank_id):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        permission_error = ensure_reference_manager(profile)
        if permission_error:
            return permission_error
        rank = Rank.objects.filter(id_rank=rank_id).first()
        if not rank:
            return Response({"detail": "rank not found"}, status=status.HTTP_404_NOT_FOUND)
        target_corps = rank.corps
        if request.data.get("corps_id"):
            target_corps = Corps.objects.filter(id_corps=request.data.get("corps_id")).first()
            if not target_corps:
                return Response({"detail": "corps not found"}, status=status.HTTP_400_BAD_REQUEST)
        code = (request.data.get("code") or rank.code).strip()
        label = (request.data.get("label") or rank.label).strip()
        code_changed = code.lower() != rank.code.lower()
        label_changed = label.lower() != rank.label.lower()
        corps_changed = target_corps.pk != rank.corps_id
        if code_changed and Rank.objects.exclude(pk=rank.pk).filter(code__iexact=code).exists():
            return Response({"detail": "Un grade avec ce code existe déjà."}, status=status.HTTP_400_BAD_REQUEST)
        if (label_changed or corps_changed) and Rank.objects.exclude(pk=rank.pk).filter(label__iexact=label, corps=target_corps).exists():
            return Response({"detail": "Un grade avec ce libellé existe déjà dans ce corps."}, status=status.HTTP_400_BAD_REQUEST)
        rank.code = code
        rank.label = label
        rank.corps = target_corps
        rank.save(update_fields=["code", "label", "corps"])
        log_event(
            request=request,
            event_type="admin.reference.rank.updated",
            target_type="rank",
            target_id=rank.id_rank,
            message=f"Admin updated rank {rank.label}",
            metadata={"corps_id": rank.corps_id},
        )
        return Response({"id": rank.id_rank, "code": rank.code, "label": rank.label, "corps_id": rank.corps_id})

    def delete(self, request, rank_id):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        permission_error = ensure_reference_manager(profile)
        if permission_error:
            return permission_error
        rank = Rank.objects.filter(id_rank=rank_id).first()
        if not rank:
            return Response({"detail": "rank not found"}, status=status.HTTP_404_NOT_FOUND)
        label = rank.label
        rank.delete()
        log_event(
            request=request,
            event_type="admin.reference.rank.deleted",
            target_type="rank",
            target_id=rank_id,
            message=f"Admin deleted rank {label}",
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class AdminSpecialitiesView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        if profile.role != UserProfile.ROLE_ADMIN:
            return Response({"detail": "Forbidden for this role"}, status=status.HTTP_403_FORBIDDEN)
        code = (request.data.get("code") or "").strip()
        label = (request.data.get("label") or "").strip()
        corps_id = request.data.get("corps_id")
        corps = None
        if corps_id:
            corps = Corps.objects.filter(id_corps=corps_id).first()
            if not corps:
                return Response({"detail": "corps not found"}, status=status.HTTP_400_BAD_REQUEST)
        if not code or not label:
            return Response({"detail": "code and label are required"}, status=status.HTTP_400_BAD_REQUEST)
        if Speciality.objects.filter(models.Q(code__iexact=code) | models.Q(label__iexact=label)).exists():
            return Response({"detail": "speciality already exists"}, status=status.HTTP_400_BAD_REQUEST)
        speciality = Speciality.objects.create(code=code, label=label, corps=corps)
        log_event(
            request=request,
            event_type="admin.reference.speciality.created",
            target_type="speciality",
            target_id=speciality.id_speciality,
            message=f"Admin created speciality {speciality.label}",
            metadata={"corps_id": speciality.corps_id} if speciality.corps_id else {},
        )
        return Response(
            {
                "id": speciality.id_speciality,
                "code": speciality.code,
                "label": speciality.label,
                "corps_id": speciality.corps_id,
            },
            status=status.HTTP_201_CREATED,
        )

    def patch(self, request, speciality_id):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        permission_error = ensure_reference_manager(profile)
        if permission_error:
            return permission_error
        speciality = Speciality.objects.filter(id_speciality=speciality_id).first()
        if not speciality:
            return Response({"detail": "speciality not found"}, status=status.HTTP_404_NOT_FOUND)
        target_corps = speciality.corps
        if request.data.get("corps_id"):
            target_corps = Corps.objects.filter(id_corps=request.data.get("corps_id")).first()
            if not target_corps:
                return Response({"detail": "corps not found"}, status=status.HTTP_400_BAD_REQUEST)
        code = (request.data.get("code") or speciality.code).strip()
        label = (request.data.get("label") or speciality.label).strip()
        code_changed = code.lower() != speciality.code.lower()
        label_changed = label.lower() != speciality.label.lower()
        if code_changed and Speciality.objects.exclude(pk=speciality.pk).filter(code__iexact=code).exists():
            return Response({"detail": "Une spécialité avec ce code existe déjà."}, status=status.HTTP_400_BAD_REQUEST)
        if label_changed and Speciality.objects.exclude(pk=speciality.pk).filter(label__iexact=label).exists():
            return Response({"detail": "Une spécialité avec ce libellé existe déjà."}, status=status.HTTP_400_BAD_REQUEST)
        speciality.code = code
        speciality.label = label
        speciality.corps = target_corps
        speciality.save(update_fields=["code", "label", "corps"])
        log_event(
            request=request,
            event_type="admin.reference.speciality.updated",
            target_type="speciality",
            target_id=speciality.id_speciality,
            message=f"Admin updated speciality {speciality.label}",
            metadata={"corps_id": speciality.corps_id} if speciality.corps_id else {},
        )
        return Response({"id": speciality.id_speciality, "code": speciality.code, "label": speciality.label, "corps_id": speciality.corps_id})

    def delete(self, request, speciality_id):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        permission_error = ensure_reference_manager(profile)
        if permission_error:
            return permission_error
        speciality = Speciality.objects.filter(id_speciality=speciality_id).first()
        if not speciality:
            return Response({"detail": "speciality not found"}, status=status.HTTP_404_NOT_FOUND)
        label = speciality.label
        speciality.delete()
        log_event(
            request=request,
            event_type="admin.reference.speciality.deleted",
            target_type="speciality",
            target_id=speciality_id,
            message=f"Admin deleted speciality {label}",
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class AdminSubjectsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        if profile.role != UserProfile.ROLE_ADMIN:
            return Response({"detail": "Forbidden for this role"}, status=status.HTTP_403_FORBIDDEN)

        return Response(
            {
                "subjects": [
                    {"id": s.id_specialite, "label": s.libelle}
                    for s in Specialite.objects.all().order_by("libelle")
                ]
            }
        )

    def post(self, request):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        if profile.role != UserProfile.ROLE_ADMIN:
            return Response({"detail": "Forbidden for this role"}, status=status.HTTP_403_FORBIDDEN)

        label = (request.data.get("label") or "").strip()
        if not label:
            return Response({"detail": "label is required"}, status=status.HTTP_400_BAD_REQUEST)
        if Specialite.objects.filter(libelle__iexact=label).exists():
            return Response({"detail": "subject already exists"}, status=status.HTTP_400_BAD_REQUEST)

        subject = Specialite.objects.create(libelle=label)
        log_event(
            request=request,
            event_type="admin.subject.created",
            target_type="subject",
            target_id=subject.id_specialite,
            message=f"Admin created subject {subject.libelle}",
        )
        return Response({"id": subject.id_specialite, "label": subject.libelle}, status=status.HTTP_201_CREATED)


class AdminSubjectControlsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, subject_id):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        if profile.role != UserProfile.ROLE_ADMIN:
            return Response({"detail": "Forbidden for this role"}, status=status.HTTP_403_FORBIDDEN)

        subject = Specialite.objects.filter(id_specialite=subject_id).first()
        if not subject:
            return Response({"detail": "subject not found"}, status=status.HTTP_404_NOT_FOUND)

        controls = (
            Controle.objects.filter(cours__specialite=subject)
            .select_related("cours", "instructeur")
            .order_by("-id_controle")
        )
        return Response(
            {
                "subject": {"id": subject.id_specialite, "label": subject.libelle},
                "controls": [
                    {
                        "id": c.id_controle,
                        "name": c.nom,
                        "status": c.statut,
                        "cours_id": c.cours_id,
                        "cours_title": c.cours.titre,
                        "instructeur_username": c.instructeur.username,
                        "deadline": c.date_limite,
                    }
                    for c in controls[:200]
                ],
            }
        )


class AdminSubjectCoursesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, subject_id):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        if profile.role != UserProfile.ROLE_ADMIN:
            return Response({"detail": "Forbidden for this role"}, status=status.HTTP_403_FORBIDDEN)

        subject = Specialite.objects.filter(id_specialite=subject_id).first()
        if not subject:
            return Response({"detail": "subject not found"}, status=status.HTTP_404_NOT_FOUND)

        courses = (
            Cours.objects.filter(specialite=subject)
            .select_related("instructeur")
            .order_by("-date_depot")
        )
        return Response(
            {
                "subject": {"id": subject.id_specialite, "label": subject.libelle},
                "courses": [
                    {
                        "id": c.id_cours,
                        "title": c.titre,
                        "status": c.statut,
                        "instructeur_username": c.instructeur.username,
                        "date_depot": c.date_depot,
                    }
                    for c in courses[:200]
                ],
            }
        )


class AdminUpdateControlStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, controle_id):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        if profile.role != UserProfile.ROLE_ADMIN:
            return Response({"detail": "Forbidden for this role"}, status=status.HTTP_403_FORBIDDEN)

        controle = Controle.objects.filter(id_controle=controle_id).first()
        if not controle:
            return Response({"detail": "controle not found"}, status=status.HTTP_404_NOT_FOUND)

        target_status = request.data.get("status")
        valid_status = {choice[0] for choice in Controle.STATUT_CHOICES}
        if target_status not in valid_status:
            return Response({"detail": "Invalid status"}, status=status.HTTP_400_BAD_REQUEST)

        controle.statut = target_status
        if target_status == Controle.STATUT_PUBLIE and controle.date_publication is None:
            controle.date_publication = timezone.now()
            controle.save(update_fields=["statut", "date_publication"])
        else:
            controle.save(update_fields=["statut"])
        log_event(
            request=request,
            event_type="admin.controle.status_updated",
            target_type="controle",
            target_id=controle.id_controle,
            message=f"Admin updated controle status to {target_status}",
        )
        return Response({"id": controle.id_controle, "status": controle.statut})


class AdminUpdateCourseStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, cours_id):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        if profile.role != UserProfile.ROLE_ADMIN:
            return Response({"detail": "Forbidden for this role"}, status=status.HTTP_403_FORBIDDEN)

        cours = Cours.objects.filter(id_cours=cours_id).first()
        if not cours:
            return Response({"detail": "cours not found"}, status=status.HTTP_404_NOT_FOUND)

        target_status = request.data.get("status")
        valid_status = {choice[0] for choice in Cours.STATUT_CHOICES}
        if target_status not in valid_status:
            return Response({"detail": "Invalid status"}, status=status.HTTP_400_BAD_REQUEST)

        was_published = cours.statut == Cours.STATUT_PUBLIE
        cours.statut = target_status
        cours.save(update_fields=["statut"])
        log_event(
            request=request,
            event_type="admin.cours.status_updated",
            target_type="cours",
            target_id=cours.id_cours,
            message=f"Admin updated cours status to {target_status}",
        )
        if target_status == Cours.STATUT_PUBLIE and not was_published:
            notify_stagiaires_new_cours(cours)
        return Response({"id": cours.id_cours, "status": cours.statut})


class InstructeurCoursCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        if profile.role != UserProfile.ROLE_INSTRUCTEUR:
            return Response({"detail": "Forbidden for this role"}, status=status.HTTP_403_FORBIDDEN)

        titre = (request.data.get("titre") or "").strip()
        description = (request.data.get("description") or "").strip()
        specialite_id = request.data.get("specialite_id")
        module_id = request.data.get("module_id")
        matiere_id = request.data.get("matiere_id")
        publier = bool(request.data.get("publier", False))

        if not titre:
            return Response({"detail": "titre is required"}, status=status.HTTP_400_BAD_REQUEST)

        specialite = None
        if specialite_id:
            specialite = Specialite.objects.filter(id_specialite=specialite_id).first()
            if not specialite:
                return Response({"detail": "specialite not found"}, status=status.HTTP_400_BAD_REQUEST)

        module = None
        if module_id:
            module = Module.objects.filter(id_module=module_id).first()
            if not module:
                return Response({"detail": "module not found"}, status=status.HTTP_400_BAD_REQUEST)

        matiere = None
        if matiere_id:
            matiere = Matiere.objects.filter(id_matiere=matiere_id).first()
            if not matiere:
                return Response({"detail": "matiere not found"}, status=status.HTTP_400_BAD_REQUEST)
            # auto-set module from matiere
            if not module and matiere.module:
                module = matiere.module

        cours = Cours.objects.create(
            titre=titre,
            description=description,
            instructeur=request.user,
            specialite=specialite,
            module=module,
            matiere=matiere,
            statut=Cours.STATUT_PUBLIE if publier else Cours.STATUT_BROUILLON,
            date_depot=timezone.now().date(),
        )
        log_event(
            request=request,
            event_type="instructeur.cours.created",
            target_type="cours",
            target_id=cours.id_cours,
            message=f"Instructeur created cours {cours.titre}",
            metadata={"status": cours.statut},
        )
        if cours.statut == Cours.STATUT_PUBLIE:
            notify_stagiaires_new_cours(cours)
        return Response(
            {"id": cours.id_cours, "titre": cours.titre, "statut": cours.statut},
            status=status.HTTP_201_CREATED,
        )


class InstructeurControleCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        if profile.role != UserProfile.ROLE_INSTRUCTEUR:
            return Response({"detail": "Forbidden for this role"}, status=status.HTTP_403_FORBIDDEN)

        cours_id = request.data.get("cours_id")
        nom = (request.data.get("nom") or "").strip()
        enonce = (request.data.get("enonce") or "").strip()
        bareme = request.data.get("bareme", 20)
        date_limite = request.data.get("date_limite")
        publier = bool(request.data.get("publier", False))

        cours = Cours.objects.filter(id_cours=cours_id, instructeur=request.user).first()
        if not cours:
            return Response({"detail": "cours not found"}, status=status.HTTP_400_BAD_REQUEST)
        if not nom:
            return Response({"detail": "nom is required"}, status=status.HTTP_400_BAD_REQUEST)

        controle = Controle.objects.create(
            cours=cours,
            instructeur=request.user,
            nom=nom,
            enonce=enonce,
            bareme=bareme,
            date_limite=date_limite,
            statut=Controle.STATUT_PUBLIE if publier else Controle.STATUT_BROUILLON,
            date_publication=timezone.now() if publier else None,
        )
        log_event(
            request=request,
            event_type="instructeur.controle.created",
            target_type="controle",
            target_id=controle.id_controle,
            message=f"Instructeur created controle {controle.nom}",
            metadata={"status": controle.statut},
        )
        return Response(
            {"id": controle.id_controle, "nom": controle.nom, "statut": controle.statut},
            status=status.HTTP_201_CREATED,
        )


class StageaireSubmitControleView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, controle_id):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        if profile.role != UserProfile.ROLE_STAGIAIRE:
            return Response({"detail": "Forbidden for this role"}, status=status.HTTP_403_FORBIDDEN)

        controle = Controle.objects.filter(id_controle=controle_id, statut=Controle.STATUT_PUBLIE).first()
        if not controle:
            return Response({"detail": "controle not found"}, status=status.HTTP_404_NOT_FOUND)

        commentaire = (request.data.get("commentaire") or "").strip()
        fichier_b64 = (request.data.get("fichier_base64") or "").strip()
        nom_fichier = (request.data.get("nom_fichier") or "").strip()
        mime_type = (request.data.get("mime_type") or "application/rtf").strip()

        if not commentaire and not fichier_b64:
            return Response({"detail": "commentaire ou fichier_base64 est requis"}, status=status.HTTP_400_BAD_REQUEST)

        fichier_bytes = None
        if fichier_b64:
            try:
                fichier_bytes = base64.b64decode(fichier_b64)
            except Exception:
                return Response({"detail": "fichier_base64 invalide"}, status=status.HTTP_400_BAD_REQUEST)

        soumission, created = SoumissionControle.objects.get_or_create(
            controle=controle,
            stagiaire=request.user,
            defaults={
                "commentaire": commentaire,
                "date_soumission": timezone.now(),
                "statut": SoumissionControle.STATUT_SOUMIS,
                "fichier_reponse": fichier_bytes,
                "nom_fichier_reponse": nom_fichier,
                "mime_type_reponse": mime_type if fichier_bytes else "",
            },
        )
        if not created:
            update_fields = ["commentaire", "date_soumission", "statut"]
            soumission.commentaire = commentaire
            soumission.date_soumission = timezone.now()
            soumission.statut = SoumissionControle.STATUT_SOUMIS
            if fichier_bytes is not None:
                soumission.fichier_reponse = fichier_bytes
                soumission.nom_fichier_reponse = nom_fichier
                soumission.mime_type_reponse = mime_type
                update_fields += ["fichier_reponse", "nom_fichier_reponse", "mime_type_reponse"]
            soumission.save(update_fields=update_fields)

        log_event(
            request=request,
            event_type="stageaire.controle.submitted",
            target_type="controle",
            target_id=controle.id_controle,
            message=f"Stagiaire submitted controle {controle.nom}",
            metadata={"soumission_id": soumission.id_soumission},
        )

        return Response(
            {"soumission_id": soumission.id_soumission, "statut": soumission.statut},
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class InstructeurEvaluateSoumissionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, soumission_id):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        if profile.role != UserProfile.ROLE_INSTRUCTEUR:
            return Response({"detail": "Forbidden for this role"}, status=status.HTTP_403_FORBIDDEN)

        soumission = SoumissionControle.objects.filter(id_soumission=soumission_id).select_related(
            "controle"
        ).first()
        if not soumission or soumission.controle.instructeur_id != request.user.id:
            return Response({"detail": "soumission not found"}, status=status.HTTP_404_NOT_FOUND)

        note = request.data.get("note")
        correction = (request.data.get("correction") or "").strip()
        publier_note = bool(request.data.get("publier_note", True))
        if note is None:
            return Response({"detail": "note is required"}, status=status.HTTP_400_BAD_REQUEST)

        evaluation, _ = Evaluation.objects.update_or_create(
            soumission=soumission,
            defaults={
                "instructeur": request.user,
                "note": note,
                "correction": correction,
                "date_eval": timezone.now(),
                "est_publiee": publier_note,
                "date_publication": timezone.now() if publier_note else None,
            },
        )
        log_event(
            request=request,
            event_type="instructeur.soumission.evaluated",
            target_type="soumission",
            target_id=soumission.id_soumission,
            message="Instructeur evaluated soumission",
            metadata={"published": bool(evaluation.est_publiee), "note": str(evaluation.note)},
        )
        return Response(
            {"evaluation_id": evaluation.id_evaluation, "note": evaluation.note, "published": evaluation.est_publiee}
        )


class InstructeurPublishCorrectionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, controle_id):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        if profile.role != UserProfile.ROLE_INSTRUCTEUR:
            return Response({"detail": "Forbidden for this role"}, status=status.HTTP_403_FORBIDDEN)

        controle = Controle.objects.filter(id_controle=controle_id, instructeur=request.user).first()
        if not controle:
            return Response({"detail": "controle not found"}, status=status.HTTP_404_NOT_FOUND)

        titre = (request.data.get("titre") or "").strip()
        texte = (request.data.get("texte_correction") or "").strip()

        fichier_bytes = None
        nom_fichier_correction = ""
        mime_type_correction = ""
        uploaded_file = request.FILES.get("fichier_correction")
        if uploaded_file:
            fichier_bytes = uploaded_file.read()
            nom_fichier_correction = uploaded_file.name
            mime_type_correction = uploaded_file.content_type or "application/octet-stream"

        last_version = controle.corrections.order_by("-version_no").values_list("version_no", flat=True).first() or 0
        correction = ControleCorrection.objects.create(
            controle=controle,
            version_no=last_version + 1,
            titre=titre,
            texte_correction=texte,
            fichier_correction=fichier_bytes,
            nom_fichier_correction=nom_fichier_correction,
            mime_type_correction=mime_type_correction,
            publie_par=request.user,
            date_publication=timezone.now(),
        )
        controle.statut = Controle.STATUT_CORRIGE
        controle.save(update_fields=["statut"])
        log_event(
            request=request,
            event_type="instructeur.controle.correction_published",
            target_type="controle",
            target_id=controle.id_controle,
            message=f"Instructeur published correction for {controle.nom}",
            metadata={"version": correction.version_no},
        )
        notify_stagiaires_correction_published(controle, correction)

        return Response(
            {
                "correction_id": correction.id_correction,
                "version": correction.version_no,
                "controle_statut": controle.statut,
            },
            status=status.HTTP_201_CREATED,
        )


class InstructeurCoursDeleteView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, cours_id):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        if profile.role != UserProfile.ROLE_INSTRUCTEUR:
            return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)
        cours = Cours.objects.filter(id_cours=cours_id, instructeur=request.user).first()
        if not cours:
            return Response({"detail": "not found"}, status=status.HTTP_404_NOT_FOUND)
        cours.delete()
        return Response({"status": "deleted"})


class InstructeurControleDeleteView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, controle_id):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        if profile.role != UserProfile.ROLE_INSTRUCTEUR:
            return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)
        controle = Controle.objects.filter(id_controle=controle_id, instructeur=request.user).first()
        if not controle:
            return Response({"detail": "not found"}, status=status.HTTP_404_NOT_FOUND)
        controle.delete()
        return Response({"status": "deleted"})


class InstructeurCoursFichierView(APIView):
    """Upload (POST) or download (GET) the RTF file attached to a course."""
    permission_classes = [IsAuthenticated]

    def _get_cours(self, request, cours_id):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        if profile.role != UserProfile.ROLE_INSTRUCTEUR:
            return None, Response({"detail": "Forbidden for this role"}, status=status.HTTP_403_FORBIDDEN)
        cours = Cours.objects.filter(id_cours=cours_id, instructeur=request.user).first()
        if not cours:
            return None, Response({"detail": "cours not found"}, status=status.HTTP_404_NOT_FOUND)
        return cours, None

    def post(self, request, cours_id):
        cours, err = self._get_cours(request, cours_id)
        if err:
            return err
        fichier_b64 = (request.data.get("fichier_base64") or "").strip()
        nom_fichier = (request.data.get("nom_fichier") or "document.rtf").strip()
        mime_type = (request.data.get("mime_type") or "application/rtf").strip()
        if not fichier_b64:
            return Response({"detail": "fichier_base64 is required"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            file_bytes = base64.b64decode(fichier_b64)
        except Exception:
            return Response({"detail": "fichier_base64 invalide"}, status=status.HTTP_400_BAD_REQUEST)
        fichier = CoursFichier(
            cours=cours,
            nom_fichier=nom_fichier,
            mime_type=mime_type,
            taille_octets=len(file_bytes),
        )
        fichier.fichier.save(nom_fichier, ContentFile(file_bytes), save=True)
        return Response({"fichier_id": fichier.id_cours_fichier, "nom_fichier": nom_fichier}, status=status.HTTP_201_CREATED)

    def get(self, request, cours_id):
        cours, err = self._get_cours(request, cours_id)
        if err:
            return err
        fichiers = cours.fichiers.order_by("-date_ajout").values("id_cours_fichier", "nom_fichier", "mime_type", "taille_octets", "date_ajout")
        return Response({"fichiers": list(fichiers)})


class InstructeurCoursFichierDownloadView(APIView):
    """Download the binary content of a specific course file."""
    permission_classes = [IsAuthenticated]

    def get(self, request, cours_id, fichier_id):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        if profile.role != UserProfile.ROLE_INSTRUCTEUR:
            return Response({"detail": "Forbidden for this role"}, status=status.HTTP_403_FORBIDDEN)
        fichier = CoursFichier.objects.filter(id_cours_fichier=fichier_id, cours__instructeur=request.user, cours_id=cours_id).first()
        if not fichier or not fichier.fichier:
            return Response({"detail": "fichier not found"}, status=status.HTTP_404_NOT_FOUND)
        with fichier.fichier.open("rb") as fh:
            content = fh.read()
        return Response({
            "nom_fichier": fichier.nom_fichier,
            "mime_type": fichier.mime_type,
            "fichier_base64": base64.b64encode(content).decode(),
        })


class InstructeurControleFichierView(APIView):
    """Upload (POST) or download (GET) the RTF enonce file of a controle."""
    permission_classes = [IsAuthenticated]

    def _get_controle(self, request, controle_id):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        if profile.role != UserProfile.ROLE_INSTRUCTEUR:
            return None, Response({"detail": "Forbidden for this role"}, status=status.HTTP_403_FORBIDDEN)
        controle = Controle.objects.filter(id_controle=controle_id, instructeur=request.user).first()
        if not controle:
            return None, Response({"detail": "controle not found"}, status=status.HTTP_404_NOT_FOUND)
        return controle, None

    def post(self, request, controle_id):
        controle, err = self._get_controle(request, controle_id)
        if err:
            return err
        fichier_b64 = (request.data.get("fichier_base64") or "").strip()
        nom_fichier = (request.data.get("nom_fichier") or "enonce.rtf").strip()
        mime_type = (request.data.get("mime_type") or "application/rtf").strip()
        if not fichier_b64:
            return Response({"detail": "fichier_base64 is required"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            file_bytes = base64.b64decode(fichier_b64)
        except Exception:
            return Response({"detail": "fichier_base64 invalide"}, status=status.HTTP_400_BAD_REQUEST)
        controle.fichier_enonce = file_bytes
        controle.nom_fichier_enonce = nom_fichier
        controle.mime_type_enonce = mime_type
        controle.save(update_fields=["fichier_enonce", "nom_fichier_enonce", "mime_type_enonce"])
        return Response({"nom_fichier": nom_fichier}, status=status.HTTP_200_OK)

    def get(self, request, controle_id):
        controle, err = self._get_controle(request, controle_id)
        if err:
            return err
        if not controle.fichier_enonce:
            return Response({"detail": "no file attached"}, status=status.HTTP_404_NOT_FOUND)
        return Response({
            "nom_fichier": controle.nom_fichier_enonce,
            "mime_type": controle.mime_type_enonce,
            "fichier_base64": base64.b64encode(bytes(controle.fichier_enonce)).decode(),
        })


class InstructeurSoumissionFichierView(APIView):
    """Download the RTF response file a stagiaire attached to their submission."""
    permission_classes = [IsAuthenticated]

    def get(self, request, soumission_id):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        if profile.role != UserProfile.ROLE_INSTRUCTEUR:
            return Response({"detail": "Forbidden for this role"}, status=status.HTTP_403_FORBIDDEN)
        soumission = SoumissionControle.objects.filter(
            id_soumission=soumission_id,
            controle__instructeur=request.user,
        ).first()
        if not soumission:
            return Response({"detail": "soumission not found"}, status=status.HTTP_404_NOT_FOUND)
        if not soumission.fichier_reponse:
            return Response({"detail": "no file attached"}, status=status.HTTP_404_NOT_FOUND)
        return Response({
            "nom_fichier": soumission.nom_fichier_reponse,
            "mime_type": soumission.mime_type_reponse,
            "fichier_base64": base64.b64encode(bytes(soumission.fichier_reponse)).decode(),
        })


class StageaireCoursDetailView(APIView):
    """Returns full details of a published course for a stagiaire, including fichiers and controls."""
    permission_classes = [IsAuthenticated]

    def get(self, request, cours_id):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        if profile.role != UserProfile.ROLE_STAGIAIRE:
            return Response({"detail": "Forbidden for this role"}, status=status.HTTP_403_FORBIDDEN)

        cours = Cours.objects.filter(id_cours=cours_id, statut=Cours.STATUT_PUBLIE).select_related("instructeur", "specialite").first()
        if not cours:
            return Response({"detail": "cours not found"}, status=status.HTTP_404_NOT_FOUND)

        fichiers = cours.fichiers.order_by("-date_ajout").values(
            "id_cours_fichier", "nom_fichier", "mime_type", "taille_octets"
        )
        controles = Controle.objects.filter(
            cours=cours, statut=Controle.STATUT_PUBLIE
        ).order_by("nom")

        return Response({
            "id": cours.id_cours,
            "titre": cours.titre,
            "matiere": cours.matiere.nom if cours.matiere else (cours.specialite.libelle if cours.specialite else ""),
            "description": cours.description,
            "instructeur": cours.instructeur.username,
            "date_depot": cours.date_depot,
            "fichiers": list(fichiers),
            "controles": [
                {
                    "id": c.id_controle,
                    "nom": c.nom,
                    "enonce": c.enonce,
                    "bareme": c.bareme,
                    "date_limite": c.date_limite,
                    "has_fichier": bool(c.fichier_enonce),
                    "nom_fichier_enonce": c.nom_fichier_enonce,
                }
                for c in controles
            ],
        })


class StageaireCoursFichierDownloadView(APIView):
    """Download a course RTF file as a stagiaire."""
    permission_classes = [IsAuthenticated]

    def get(self, request, cours_id, fichier_id):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        if profile.role != UserProfile.ROLE_STAGIAIRE:
            return Response({"detail": "Forbidden for this role"}, status=status.HTTP_403_FORBIDDEN)

        fichier = CoursFichier.objects.filter(
            id_cours_fichier=fichier_id,
            cours_id=cours_id,
            cours__statut=Cours.STATUT_PUBLIE,
        ).first()
        if not fichier or not fichier.fichier:
            return Response({"detail": "fichier not found"}, status=status.HTTP_404_NOT_FOUND)

        with fichier.fichier.open("rb") as fh:
            content = fh.read()
        return Response({
            "nom_fichier": fichier.nom_fichier,
            "mime_type": fichier.mime_type,
            "fichier_base64": base64.b64encode(content).decode(),
        })


class ModulesListView(APIView):
    """Returns list of all modules with their matieres (any authenticated role)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        modules = Module.objects.prefetch_related("matieres").all()
        return Response([
            {
                "id": m.id_module,
                "nom": m.nom,
                "matieres": [
                    {
                        "id": mat.id_matiere,
                        "nom": mat.nom,
                        "cours_count": mat.cours.filter(statut=Cours.STATUT_PUBLIE).count(),
                    }
                    for mat in m.matieres.all()
                ],
            }
            for m in modules
        ])


# Alias for backward compat with stagiaire-specific URL
StageaireModulesListView = ModulesListView


class StageaireModuleMatieresView(APIView):
    """Returns matieres within a module."""
    permission_classes = [IsAuthenticated]

    def get(self, request, module_id):
        module = Module.objects.filter(id_module=module_id).prefetch_related("matieres").first()
        if not module:
            return Response({"detail": "module not found"}, status=status.HTTP_404_NOT_FOUND)

        return Response({
            "module_id": module.id_module,
            "module_nom": module.nom,
            "matieres": [
                {
                    "id": mat.id_matiere,
                    "nom": mat.nom,
                    "cours_count": mat.cours.filter(statut=Cours.STATUT_PUBLIE).count(),
                }
                for mat in module.matieres.all()
            ],
        })


class StageaireMatiereCoursListView(APIView):
    """Returns published courses and brochures within a matiere."""
    permission_classes = [IsAuthenticated]

    def get(self, request, matiere_id):
        matiere = Matiere.objects.select_related("module").prefetch_related("brochures").filter(id_matiere=matiere_id).first()
        if not matiere:
            return Response({"detail": "matiere not found"}, status=status.HTTP_404_NOT_FOUND)

        brochures = list(matiere.brochures.all())
        cours_list = Cours.objects.filter(
            matiere=matiere, statut=Cours.STATUT_PUBLIE
        ).select_related("instructeur").order_by("-date_depot")[:30]

        return Response({
            "matiere_id": matiere.id_matiere,
            "matiere_nom": matiere.nom,
            "module_id": matiere.module.id_module,
            "module_nom": matiere.module.nom,
            "brochures": [
                {
                    "id": b.id_brochure,
                    "nom": b.nom,
                    "cours_count": b.cours.filter(statut=Cours.STATUT_PUBLIE).count(),
                }
                for b in brochures
            ],
            "cours": [
                {
                    "id": c.id_cours,
                    "titre": c.titre,
                    "description": c.description,
                    "instructeur": c.instructeur.username,
                    "controles_count": c.controles.filter(statut=Controle.STATUT_PUBLIE).count(),
                }
                for c in cours_list
            ],
        })


class StageaireBrochureCoursListView(APIView):
    """Returns published courses within a brochure."""
    permission_classes = [IsAuthenticated]

    def get(self, request, brochure_id):
        brochure = Brochure.objects.select_related("matiere__module").filter(id_brochure=brochure_id).first()
        if not brochure:
            return Response({"detail": "brochure not found"}, status=status.HTTP_404_NOT_FOUND)

        cours_list = Cours.objects.filter(
            brochure=brochure, statut=Cours.STATUT_PUBLIE
        ).select_related("instructeur").order_by("-date_depot")[:30]

        return Response({
            "brochure_id": brochure.id_brochure,
            "brochure_nom": brochure.nom,
            "matiere_id": brochure.matiere.id_matiere,
            "matiere_nom": brochure.matiere.nom,
            "module_nom": brochure.matiere.module.nom,
            "cours": [
                {
                    "id": c.id_cours,
                    "titre": c.titre,
                    "description": c.description,
                    "instructeur": c.instructeur.username,
                    "controles_count": c.controles.filter(statut=Controle.STATUT_PUBLIE).count(),
                }
                for c in cours_list
            ],
        })


class StageaireModuleCoursListView(APIView):
    """Returns matieres within a module (kept for backward compat)."""
    permission_classes = [IsAuthenticated]

    def get(self, request, module_id):
        return StageaireModuleMatieresView().get(request, module_id)


class StageaireControleFichierDownloadView(APIView):
    """Download the RTF enonce file of a control as a stagiaire."""
    permission_classes = [IsAuthenticated]

    def get(self, request, controle_id):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        if profile.role != UserProfile.ROLE_STAGIAIRE:
            return Response({"detail": "Forbidden for this role"}, status=status.HTTP_403_FORBIDDEN)

        controle = Controle.objects.filter(
            id_controle=controle_id, statut=Controle.STATUT_PUBLIE
        ).first()
        if not controle or not controle.fichier_enonce:
            return Response({"detail": "fichier not found"}, status=status.HTTP_404_NOT_FOUND)

        return Response({
            "nom_fichier": controle.nom_fichier_enonce,
            "mime_type": controle.mime_type_enonce,
            "fichier_base64": base64.b64encode(bytes(controle.fichier_enonce)).decode(),
        })


# ── Feuille de rédaction ──────────────────────────────────────────────────────

class FeuilleRedactionFichiersListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        fichiers = FeuilleRedactionFichier.objects.all().order_by("-uploaded_at")
        return Response({
            "fichiers": [
                {
                    "id": f.id,
                    "titre": f.titre,
                    "nom_fichier": f.nom_fichier,
                    "uploaded_at": f.uploaded_at.isoformat(),
                }
                for f in fichiers
            ]
        })


class FeuilleRedactionFichierDownloadView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, fichier_id):
        f = FeuilleRedactionFichier.objects.filter(id=fichier_id).first()
        if not f or not f.fichier:
            return Response({"detail": "Fichier introuvable."}, status=status.HTTP_404_NOT_FOUND)
        return Response({
            "fichier_base64": base64.b64encode(bytes(f.fichier)).decode(),
            "nom_fichier": f.nom_fichier,
            "mime_type": f.mime_type,
        })


class AdminFeuilleRedactionUploadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        if profile.role != UserProfile.ROLE_ADMIN:
            return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

        fichier_base64 = request.data.get("fichier_base64")
        nom_fichier = request.data.get("nom_fichier", "fichier")
        mime_type = request.data.get("mime_type", "application/octet-stream")
        titre = request.data.get("titre") or nom_fichier

        if not fichier_base64:
            return Response({"detail": "fichier_base64 requis."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            fichier_bytes = base64.b64decode(fichier_base64)
        except Exception:
            return Response({"detail": "fichier_base64 invalide."}, status=status.HTTP_400_BAD_REQUEST)

        FeuilleRedactionFichier.objects.create(
            titre=titre,
            nom_fichier=nom_fichier,
            mime_type=mime_type,
            fichier=fichier_bytes,
            uploaded_by=request.user,
        )
        return Response({"detail": "Fichier partagé."}, status=status.HTTP_201_CREATED)


class AdminFeuilleRedactionDeleteView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, fichier_id):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        if profile.role != UserProfile.ROLE_ADMIN:
            return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)
        f = FeuilleRedactionFichier.objects.filter(id=fichier_id).first()
        if not f:
            return Response({"detail": "Fichier introuvable."}, status=status.HTTP_404_NOT_FOUND)
        f.delete()
        return Response({"detail": "Supprimé."})


# ── Installation & Logiciels ──────────────────────────────────────────────────

class InstallationLogicielsFichiersListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        fichiers = InstallationLogicielFichier.objects.all().order_by("-uploaded_at")
        return Response({
            "fichiers": [
                {
                    "id": f.id,
                    "titre": f.titre,
                    "nom_fichier": f.nom_fichier,
                    "mime_type": f.mime_type,
                    "uploaded_at": f.uploaded_at.isoformat(),
                }
                for f in fichiers
            ]
        })


class InstallationLogicielsFichierDownloadView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, fichier_id):
        f = InstallationLogicielFichier.objects.filter(id=fichier_id).first()
        if not f or not f.fichier:
            return Response({"detail": "Fichier introuvable."}, status=status.HTTP_404_NOT_FOUND)
        return Response({
            "fichier_base64": base64.b64encode(bytes(f.fichier)).decode(),
            "nom_fichier": f.nom_fichier,
            "mime_type": f.mime_type,
        })


class InstructeurInstallationLogicielsUploadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        if profile.role != UserProfile.ROLE_INSTRUCTEUR:
            return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

        fichier_base64 = request.data.get("fichier_base64")
        nom_fichier = request.data.get("nom_fichier", "fichier")
        mime_type = request.data.get("mime_type", "application/octet-stream")
        titre = request.data.get("titre") or nom_fichier

        if not fichier_base64:
            return Response({"detail": "fichier_base64 requis."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            fichier_bytes = base64.b64decode(fichier_base64)
        except Exception:
            return Response({"detail": "fichier_base64 invalide."}, status=status.HTTP_400_BAD_REQUEST)

        InstallationLogicielFichier.objects.create(
            titre=titre,
            nom_fichier=nom_fichier,
            mime_type=mime_type,
            fichier=fichier_bytes,
            uploaded_by=request.user,
        )
        return Response({"detail": "Fichier partagé."}, status=status.HTTP_201_CREATED)


class InstructeurInstallationLogicielsDeleteView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, fichier_id):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        if profile.role != UserProfile.ROLE_INSTRUCTEUR:
            return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)
        f = InstallationLogicielFichier.objects.filter(id=fichier_id).first()
        if not f:
            return Response({"detail": "Fichier introuvable."}, status=status.HTTP_404_NOT_FOUND)
        f.delete()
        return Response({"detail": "Supprimé."})


class InstallationLogicielsZipContentsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, fichier_id):
        f = InstallationLogicielFichier.objects.filter(id=fichier_id).first()
        if not f or not f.fichier:
            return Response({"detail": "Fichier introuvable."}, status=status.HTTP_404_NOT_FOUND)
        try:
            with zipfile.ZipFile(io.BytesIO(bytes(f.fichier))) as zf:
                entries = [
                    {
                        "path": i.filename,
                        "size": i.file_size,
                        "compressed_size": i.compress_size,
                        "is_dir": i.is_dir(),
                    }
                    for i in zf.infolist()
                ]
        except zipfile.BadZipFile:
            return Response({"detail": "Ce fichier n'est pas un ZIP valide."}, status=status.HTTP_400_BAD_REQUEST)
        return Response({"entries": entries})


class InstallationLogicielsZipEntryDownloadView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, fichier_id):
        import mimetypes
        entry_path = request.query_params.get("path", "").strip()
        if not entry_path:
            return Response({"detail": "Paramètre 'path' requis."}, status=status.HTTP_400_BAD_REQUEST)
        f = InstallationLogicielFichier.objects.filter(id=fichier_id).first()
        if not f or not f.fichier:
            return Response({"detail": "Fichier introuvable."}, status=status.HTTP_404_NOT_FOUND)
        try:
            with zipfile.ZipFile(io.BytesIO(bytes(f.fichier))) as zf:
                if entry_path not in zf.namelist():
                    return Response({"detail": "Entrée introuvable dans le ZIP."}, status=status.HTTP_404_NOT_FOUND)
                entry_bytes = zf.read(entry_path)
        except zipfile.BadZipFile:
            return Response({"detail": "Ce fichier n'est pas un ZIP valide."}, status=status.HTTP_400_BAD_REQUEST)
        mime, _ = mimetypes.guess_type(entry_path)
        return Response({
            "fichier_base64": base64.b64encode(entry_bytes).decode(),
            "nom_fichier": entry_path.split("/")[-1] or entry_path,
            "mime_type": mime or "application/octet-stream",
        })


class InstallationLogicielsZipExtractView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, fichier_id):
        paths = request.data.get("paths", [])
        if not isinstance(paths, list) or not paths:
            return Response({"detail": "Liste 'paths' requise et non vide."}, status=status.HTTP_400_BAD_REQUEST)
        f = InstallationLogicielFichier.objects.filter(id=fichier_id).first()
        if not f or not f.fichier:
            return Response({"detail": "Fichier introuvable."}, status=status.HTTP_404_NOT_FOUND)
        try:
            output_buf = io.BytesIO()
            with zipfile.ZipFile(io.BytesIO(bytes(f.fichier)), "r") as src:
                available = set(src.namelist())
                with zipfile.ZipFile(output_buf, "w", compression=zipfile.ZIP_DEFLATED) as dst:
                    for p in paths:
                        if p in available:
                            dst.writestr(p, src.read(p))
        except zipfile.BadZipFile:
            return Response({"detail": "Ce fichier n'est pas un ZIP valide."}, status=status.HTTP_400_BAD_REQUEST)
        base_name = f.nom_fichier.rsplit(".", 1)[0] if "." in f.nom_fichier else f.nom_fichier
        return Response({
            "fichier_base64": base64.b64encode(output_buf.getvalue()).decode(),
            "nom_fichier": f"{base_name}_selection.zip",
            "mime_type": "application/zip",
        })


# ── Correction fichier (stagiaire) ────────────────────────────────────────────

class StageaireCorrectionFichierView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, controle_id):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        if profile.role != UserProfile.ROLE_STAGIAIRE:
            return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)
        correction = (
            ControleCorrection.objects
            .filter(controle__id_controle=controle_id)
            .order_by("-version_no")
            .first()
        )
        if not correction or not correction.fichier_correction:
            return Response({"detail": "Aucun fichier de correction."}, status=status.HTTP_404_NOT_FOUND)
        return Response({
            "fichier_base64": base64.b64encode(bytes(correction.fichier_correction)).decode(),
            "nom_fichier": correction.nom_fichier_correction or "correction.pdf",
            "mime_type": correction.mime_type_correction or "application/pdf",
        })


class InstructeurSujetFichierView(APIView):
    """Instructor uploads (POST) or deletes (DELETE) the PDF attached to a sujet fin de stage they supervise."""
    permission_classes = [IsAuthenticated]

    def _get_sujet(self, request, sujet_id):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        if profile.role != UserProfile.ROLE_INSTRUCTEUR:
            return None, Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)
        sujet = SujetFinStage.objects.filter(
            id_sujet=sujet_id,
            affectations__encadrant=request.user,
        ).first()
        if not sujet:
            return None, Response({"detail": "Sujet not found"}, status=status.HTTP_404_NOT_FOUND)
        return sujet, None

    def post(self, request, sujet_id):
        sujet, err = self._get_sujet(request, sujet_id)
        if err:
            return err
        fichier_b64 = (request.data.get("fichier_base64") or "").strip()
        nom_fichier = (request.data.get("nom_fichier") or "document.pdf").strip()
        mime_type = (request.data.get("mime_type") or "application/pdf").strip()
        if not fichier_b64:
            return Response({"detail": "fichier_base64 is required"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            file_bytes = base64.b64decode(fichier_b64)
        except Exception:
            return Response({"detail": "fichier_base64 invalide"}, status=status.HTTP_400_BAD_REQUEST)
        sujet.fichier_pdf = file_bytes
        sujet.nom_fichier_pdf = nom_fichier
        sujet.mime_type_pdf = mime_type
        sujet.save(update_fields=["fichier_pdf", "nom_fichier_pdf", "mime_type_pdf"])
        return Response({"detail": "Fichier partagé.", "nom_fichier": nom_fichier}, status=status.HTTP_200_OK)

    def delete(self, request, sujet_id):
        sujet, err = self._get_sujet(request, sujet_id)
        if err:
            return err
        sujet.fichier_pdf = None
        sujet.nom_fichier_pdf = ""
        sujet.mime_type_pdf = ""
        sujet.save(update_fields=["fichier_pdf", "nom_fichier_pdf", "mime_type_pdf"])
        return Response({"detail": "Fichier supprimé."}, status=status.HTTP_200_OK)


class SujetFichierDownloadView(APIView):
    """Download the PDF attached to a sujet fin de stage (instructor or stagiaire)."""
    permission_classes = [IsAuthenticated]

    def get(self, request, sujet_id):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        if profile.role == UserProfile.ROLE_INSTRUCTEUR:
            sujet = SujetFinStage.objects.filter(
                id_sujet=sujet_id,
                affectations__encadrant=request.user,
            ).first()
        elif profile.role == UserProfile.ROLE_STAGIAIRE:
            sujet = SujetFinStage.objects.filter(
                id_sujet=sujet_id,
                affectations__stagiaire=request.user,
            ).first()
        else:
            return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)
        if not sujet or not sujet.fichier_pdf:
            return Response({"detail": "Fichier not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response({
            "fichier_base64": base64.b64encode(bytes(sujet.fichier_pdf)).decode(),
            "nom_fichier": sujet.nom_fichier_pdf or "document.pdf",
            "mime_type": sujet.mime_type_pdf or "application/pdf",
        })


class InstructeurCreateSujetView(APIView):
    """Instructor creates a new SujetFinStage, assigns it to a stagiaire, and optionally attaches a Word file."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        if profile.role != UserProfile.ROLE_INSTRUCTEUR:
            return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

        titre = (request.data.get("titre") or "").strip()
        description = (request.data.get("description") or "").strip()
        stagiaire_id = request.data.get("stagiaire_id")
        fichier_b64 = (request.data.get("fichier_base64") or "").strip()
        nom_fichier = (request.data.get("nom_fichier") or "").strip()
        mime_type = (request.data.get("mime_type") or "application/vnd.openxmlformats-officedocument.wordprocessingml.document").strip()

        if not titre:
            return Response({"detail": "titre est requis"}, status=status.HTTP_400_BAD_REQUEST)
        if not stagiaire_id:
            return Response({"detail": "stagiaire_id est requis"}, status=status.HTTP_400_BAD_REQUEST)

        User = get_user_model()
        stagiaire = User.objects.filter(id=stagiaire_id, profile__role=UserProfile.ROLE_STAGIAIRE).first()
        if not stagiaire:
            return Response({"detail": "Stagiaire introuvable"}, status=status.HTTP_404_NOT_FOUND)

        if AffectationSujetStage.objects.filter(stagiaire=stagiaire).exists():
            return Response({"detail": "Ce stagiaire a déjà un sujet assigné"}, status=status.HTTP_400_BAD_REQUEST)

        file_bytes = None
        if fichier_b64:
            try:
                file_bytes = base64.b64decode(fichier_b64)
            except Exception:
                return Response({"detail": "fichier_base64 invalide"}, status=status.HTTP_400_BAD_REQUEST)

        sujet = SujetFinStage.objects.create(
            titre=titre,
            description=description,
            cree_par=request.user,
            statut=SujetFinStage.STATUT_VALIDE,
        )
        AffectationSujetStage.objects.create(
            sujet=sujet,
            stagiaire=stagiaire,
            encadrant=request.user,
        )
        return Response({"sujet_id": sujet.id_sujet, "titre": sujet.titre}, status=status.HTTP_201_CREATED)


class SujetFinStageFichiersListView(APIView):
    """List all shared Word documents for Sujets fin de stage (visible to all authenticated users)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        fichiers = SujetFinStageFichier.objects.all().order_by("-uploaded_at")
        return Response({
            "fichiers": [
                {
                    "id": f.id,
                    "titre": f.titre,
                    "nom_fichier": f.nom_fichier,
                    "mime_type": f.mime_type,
                    "uploaded_at": f.uploaded_at.isoformat(),
                    "uploaded_by": f.uploaded_by.username if f.uploaded_by else "",
                }
                for f in fichiers
            ]
        })


class SujetFinStageFichierDownloadView(APIView):
    """Download a shared Word document."""
    permission_classes = [IsAuthenticated]

    def get(self, request, fichier_id):
        f = SujetFinStageFichier.objects.filter(id=fichier_id).first()
        if not f or not f.fichier:
            return Response({"detail": "Fichier introuvable."}, status=status.HTTP_404_NOT_FOUND)
        return Response({
            "fichier_base64": base64.b64encode(bytes(f.fichier)).decode(),
            "nom_fichier": f.nom_fichier,
            "mime_type": f.mime_type,
        })


class InstructeurSujetFinStageFichierUploadView(APIView):
    """Instructor uploads a Word document shared with all stagiaires."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        if profile.role not in (UserProfile.ROLE_INSTRUCTEUR, UserProfile.ROLE_ADMIN):
            return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)
        fichier_base64 = (request.data.get("fichier_base64") or "").strip()
        nom_fichier = (request.data.get("nom_fichier") or "document.docx").strip()
        mime_type = (request.data.get("mime_type") or "application/vnd.openxmlformats-officedocument.wordprocessingml.document").strip()
        titre = (request.data.get("titre") or nom_fichier).strip()
        if not fichier_base64:
            return Response({"detail": "fichier_base64 requis."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            fichier_bytes = base64.b64decode(fichier_base64)
        except Exception:
            return Response({"detail": "fichier_base64 invalide."}, status=status.HTTP_400_BAD_REQUEST)
        SujetFinStageFichier.objects.create(
            titre=titre,
            nom_fichier=nom_fichier,
            mime_type=mime_type,
            fichier=fichier_bytes,
            uploaded_by=request.user,
        )
        return Response({"detail": "Fichier partagé."}, status=status.HTTP_201_CREATED)


class InstructeurSujetFinStageFichierDeleteView(APIView):
    """Instructor deletes a shared Word document they uploaded."""
    permission_classes = [IsAuthenticated]

    def delete(self, request, fichier_id):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        if profile.role != UserProfile.ROLE_INSTRUCTEUR:
            return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)
        f = SujetFinStageFichier.objects.filter(id=fichier_id, uploaded_by=request.user).first()
        if not f:
            return Response({"detail": "Fichier introuvable."}, status=status.HTTP_404_NOT_FOUND)
        f.delete()
        return Response({"detail": "Fichier supprimé."}, status=status.HTTP_200_OK)
