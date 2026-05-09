from api.models import (
    Controle,
    ControleCorrection,
    Cours,
    Evaluation,
    EventAudit,
    Inscription,
    Notification,
    Corps,
    Rank,
    SoumissionControle,
    Specialite,
    Speciality,
    UserProfile,
)
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase


class ApiTests(APITestCase):
    def setUp(self):
        self.username = "demo"
        self.password = "demo-pass-123"
        self.user = get_user_model().objects.create_user(
            username=self.username,
            password=self.password,
            email="demo@example.com",
        )
        self.corps = Corps.objects.order_by("label").first()
        self.rank = Rank.objects.filter(corps=self.corps).order_by("label").first() if self.corps else None
        self.speciality = Speciality.objects.order_by("label").first()
        UserProfile.objects.create(
            user=self.user,
            role=UserProfile.ROLE_ADMIN,
            matricule="ADM-001",
            corps=self.corps,
            rank=self.rank,
            speciality=self.speciality,
        )

    def test_health_is_public(self):
        response = self.client.get("/api/health/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, {"status": "ok"})

    def test_token_obtain_success(self):
        response = self.client.post(
            "/api/token/",
            {"username": self.username, "password": self.password},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)

    def test_token_obtain_failure(self):
        response = self.client.post(
            "/api/token/",
            {"username": self.username, "password": "wrong-password"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_me_requires_token(self):
        response = self.client.get("/api/me/")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_me_with_token(self):
        token_response = self.client.post(
            "/api/token/",
            {"username": self.username, "password": self.password},
            format="json",
        )
        access = token_response.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        response = self.client.get("/api/me/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["username"], self.username)
        self.assertEqual(response.data["role"], UserProfile.ROLE_ADMIN)
        self.assertEqual(response.data["matricule"], "ADM-001")

    def test_signup_creates_user_with_role(self):
        response = self.client.post(
            "/api/signup/",
            {
                "username": "new-user",
                "password": "new-password-123",
                "email": "new-user@example.com",
                "role": UserProfile.ROLE_COORDINATEUR,
                "matricule": "COORD-100",
                "corps_id": self.corps.id_corps,
                "rank_id": self.rank.id_rank,
                "speciality_id": self.speciality.id_speciality,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["role"], UserProfile.ROLE_COORDINATEUR)
        self.assertEqual(response.data["matricule"], "SUP-100")

    def test_signup_requires_matricule_for_non_instructeur(self):
        response = self.client.post(
            "/api/signup/",
            {
                "username": "missing-matricule",
                "password": "new-password-123",
                "email": "missing@example.com",
                "role": UserProfile.ROLE_STAGIAIRE,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_signup_rejects_admin_role(self):
        response = self.client.post(
            "/api/signup/",
            {
                "username": "admin-signup",
                "password": "new-password-123",
                "email": "admin-signup@example.com",
                "role": UserProfile.ROLE_ADMIN,
                "matricule": "ADM-NEW",
                "corps_id": self.corps.id_corps,
                "rank_id": self.rank.id_rank,
                "speciality_id": self.speciality.id_speciality,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "Admin profile cannot be created from signup")

    def test_signup_allows_empty_matricule_for_instructeur(self):
        response = self.client.post(
            "/api/signup/",
            {
                "username": "civil-instructeur",
                "password": "new-password-123",
                "email": "civil@example.com",
                "role": UserProfile.ROLE_INSTRUCTEUR,
                "matricule": "",
                "est_civil": True,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["role"], UserProfile.ROLE_INSTRUCTEUR)
        self.assertEqual(response.data["matricule"], "")

    def test_admin_can_manage_references(self):
        user_model = get_user_model()
        admin = user_model.objects.create_user(username="admin-ref", password="sup-pass-1")
        UserProfile.objects.create(
            user=admin,
            role=UserProfile.ROLE_ADMIN,
            matricule="ADM-100",
            corps=self.corps,
            rank=self.rank,
            speciality=self.speciality,
        )
        self.client.force_authenticate(user=admin)

        refs_response = self.client.get("/api/admin/references/")
        self.assertEqual(refs_response.status_code, status.HTTP_200_OK)

        corp_response = self.client.post(
            "/api/admin/references/corps/",
            {"code": "SUP_CORP", "label": "Superviseur Corps"},
            format="json",
        )
        self.assertEqual(corp_response.status_code, status.HTTP_201_CREATED)
        corp_id = corp_response.data["id"]

        rank_response = self.client.post(
            "/api/admin/references/ranks/",
            {"code": "SUP_RANK", "label": "Superviseur Rank", "corps_id": corp_id},
            format="json",
        )
        self.assertEqual(rank_response.status_code, status.HTTP_201_CREATED)
        rank_id = rank_response.data["id"]

        speciality_response = self.client.post(
            "/api/admin/references/specialities/",
            {"code": "SUP_SPEC", "label": "Superviseur Speciality", "corps_id": corp_id},
            format="json",
        )
        self.assertEqual(speciality_response.status_code, status.HTTP_201_CREATED)
        speciality_id = speciality_response.data["id"]

        patch_corp = self.client.patch(
            f"/api/admin/references/corps/{corp_id}/",
            {"label": "Superviseur Corps (maj)"},
            format="json",
        )
        self.assertEqual(patch_corp.status_code, status.HTTP_200_OK)

        patch_speciality = self.client.patch(
            f"/api/admin/references/specialities/{speciality_id}/",
            {"label": "Superviseur Speciality (maj)"},
            format="json",
        )
        self.assertEqual(patch_speciality.status_code, status.HTTP_200_OK)

        patch_rank = self.client.patch(
            f"/api/admin/references/ranks/{rank_id}/",
            {"label": "Superviseur Rank (maj)"},
            format="json",
        )
        self.assertEqual(patch_rank.status_code, status.HTTP_200_OK)

        self.client.force_authenticate(user=None)

    def test_instructeur_dashboard_endpoint(self):
        user_model = get_user_model()
        instructeur = user_model.objects.create_user(username="instr", password="pass-1234")
        UserProfile.objects.create(
            user=instructeur,
            role=UserProfile.ROLE_INSTRUCTEUR,
            matricule="I-001",
        )
        specialite = Specialite.objects.create(libelle="Maths")
        cours = Cours.objects.create(titre="Algebra", instructeur=instructeur, specialite=specialite)
        controle = Controle.objects.create(cours=cours, instructeur=instructeur, nom="Controle 1", statut=Controle.STATUT_PUBLIE)
        Notification.objects.create(
            destinataire=instructeur,
            type_notification="CONTROLE",
            titre="Nouveau rendu",
            message="Un stageaire a rendu son controle",
        )
        stageaire = user_model.objects.create_user(username="stag-dash", password="pass-1234")
        SoumissionControle.objects.create(controle=controle, stagiaire=stageaire, commentaire="done")

        token_response = self.client.post("/api/token/", {"username": "instr", "password": "pass-1234"}, format="json")
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token_response.data['access']}")
        response = self.client.get("/api/dashboard/instructeur/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["role"], UserProfile.ROLE_INSTRUCTEUR)
        self.assertEqual(response.data["cours"]["total"], 1)
        self.assertEqual(response.data["controles"]["total"], 1)

    def test_stageaire_dashboard_endpoint(self):
        user_model = get_user_model()
        instructeur = user_model.objects.create_user(username="instr2", password="pass-1234")
        UserProfile.objects.create(user=instructeur, role=UserProfile.ROLE_INSTRUCTEUR, matricule="I-002")
        stageaire = user_model.objects.create_user(username="stag2", password="pass-1234")
        UserProfile.objects.create(user=stageaire, role=UserProfile.ROLE_STAGIAIRE, matricule="S-100")

        specialite = Specialite.objects.create(libelle="Physique")
        cours = Cours.objects.create(titre="Mecanique", instructeur=instructeur, specialite=specialite, statut=Cours.STATUT_PUBLIE)
        Inscription.objects.create(stagiaire=stageaire, cours=cours)
        controle = Controle.objects.create(cours=cours, instructeur=instructeur, nom="Controle M1", statut=Controle.STATUT_PUBLIE)
        soumission = SoumissionControle.objects.create(controle=controle, stagiaire=stageaire, commentaire="reponse")
        Evaluation.objects.create(soumission=soumission, instructeur=instructeur, note=16, est_publiee=True, date_publication=timezone.now())

        token_response = self.client.post("/api/token/", {"username": "stag2", "password": "pass-1234"}, format="json")
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token_response.data['access']}")
        response = self.client.get("/api/dashboard/stageaire/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["role"], UserProfile.ROLE_STAGIAIRE)
        self.assertEqual(response.data["controls"]["available_count"], 1)
        self.assertEqual(len(response.data["notes"]), 1)

    def test_instructeur_stageaire_workflow_endpoints(self):
        user_model = get_user_model()
        instructeur = user_model.objects.create_user(username="instr3", password="pass-1234")
        UserProfile.objects.create(user=instructeur, role=UserProfile.ROLE_INSTRUCTEUR, matricule="I-003")
        stageaire = user_model.objects.create_user(username="stag3", password="pass-1234")
        UserProfile.objects.create(user=stageaire, role=UserProfile.ROLE_STAGIAIRE, matricule="S-300")

        instructeur_token = self.client.post(
            "/api/token/",
            {"username": "instr3", "password": "pass-1234"},
            format="json",
        ).data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {instructeur_token}")

        cours_response = self.client.post(
            "/api/instructeur/cours/",
            {"titre": "Cours Workflow", "description": "desc", "publier": True},
            format="json",
        )
        self.assertEqual(cours_response.status_code, status.HTTP_201_CREATED)

        controle_response = self.client.post(
            "/api/instructeur/controles/",
            {
                "cours_id": cours_response.data["id"],
                "nom": "Controle Workflow",
                "enonce": "Question",
                "publier": True,
            },
            format="json",
        )
        self.assertEqual(controle_response.status_code, status.HTTP_201_CREATED)

        cours = Cours.objects.get(id_cours=cours_response.data["id"])
        Inscription.objects.create(stagiaire=stageaire, cours=cours)

        stageaire_token = self.client.post(
            "/api/token/",
            {"username": "stag3", "password": "pass-1234"},
            format="json",
        ).data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {stageaire_token}")

        submit_response = self.client.post(
            f"/api/stageaire/controls/{controle_response.data['id']}/submit/",
            {"commentaire": "ma reponse"},
            format="json",
        )
        self.assertIn(submit_response.status_code, [status.HTTP_201_CREATED, status.HTTP_200_OK])

        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {instructeur_token}")
        eval_response = self.client.post(
            f"/api/instructeur/soumissions/{submit_response.data['soumission_id']}/evaluate/",
            {"note": 15.5, "correction": "Bon travail", "publier_note": True},
            format="json",
        )
        self.assertEqual(eval_response.status_code, status.HTTP_200_OK)

        correction_response = self.client.post(
            f"/api/instructeur/controles/{controle_response.data['id']}/publish-correction/",
            {"titre": "Correction v1", "texte_correction": "Solution detaillee"},
            format="json",
        )
        self.assertEqual(correction_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(ControleCorrection.objects.count(), 1)

    def test_coordinateur_admin_dashboards(self):
        user_model = get_user_model()
        admin = user_model.objects.create_user(username="admin1", password="pass-1234")
        coordinateur = user_model.objects.create_user(username="coord1", password="pass-1234")
        instructeur = user_model.objects.create_user(username="instr4", password="pass-1234")
        stageaire = user_model.objects.create_user(username="stag4", password="pass-1234")

        UserProfile.objects.create(user=admin, role=UserProfile.ROLE_ADMIN, matricule="A-1")
        UserProfile.objects.create(user=coordinateur, role=UserProfile.ROLE_COORDINATEUR, matricule="CO-1")
        UserProfile.objects.create(user=instructeur, role=UserProfile.ROLE_INSTRUCTEUR, matricule="I-4")
        UserProfile.objects.create(user=stageaire, role=UserProfile.ROLE_STAGIAIRE, matricule="S-4")

        cours = Cours.objects.create(titre="Analyse", instructeur=instructeur, statut=Cours.STATUT_PUBLIE)
        Inscription.objects.create(stagiaire=stageaire, cours=cours)
        controle = Controle.objects.create(cours=cours, instructeur=instructeur, nom="Ctrl A", statut=Controle.STATUT_PUBLIE)
        soumission = SoumissionControle.objects.create(controle=controle, stagiaire=stageaire, commentaire="answer")
        Evaluation.objects.create(soumission=soumission, instructeur=instructeur, note=14, est_publiee=True, date_publication=timezone.now())

        coord_token = self.client.post("/api/token/", {"username": "coord1", "password": "pass-1234"}, format="json").data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {coord_token}")
        coord_response = self.client.get("/api/dashboard/coordinateur/")
        self.assertEqual(coord_response.status_code, status.HTTP_200_OK)
        self.assertEqual(coord_response.data["role"], UserProfile.ROLE_COORDINATEUR)

        admin_token = self.client.post("/api/token/", {"username": "admin1", "password": "pass-1234"}, format="json").data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {admin_token}")
        admin_response = self.client.get("/api/dashboard/admin/")
        self.assertEqual(admin_response.status_code, status.HTTP_200_OK)
        self.assertEqual(admin_response.data["role"], UserProfile.ROLE_ADMIN)

        toggle_response = self.client.post(f"/api/admin/users/{stageaire.id}/toggle-active/")
        self.assertEqual(toggle_response.status_code, status.HTTP_200_OK)

    def test_admin_accounts_and_subjects_management(self):
        user_model = get_user_model()
        admin = user_model.objects.create_user(username="admin2", password="pass-1234")
        instructeur = user_model.objects.create_user(username="instr5", password="pass-1234")
        UserProfile.objects.create(user=admin, role=UserProfile.ROLE_ADMIN, matricule="A-2")
        UserProfile.objects.create(user=instructeur, role=UserProfile.ROLE_INSTRUCTEUR, matricule="I-5")

        admin_token = self.client.post("/api/token/", {"username": "admin2", "password": "pass-1234"}, format="json").data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {admin_token}")

        create_account_response = self.client.post(
            "/api/admin/accounts/create/",
            {
                "username": "bulk-one",
                "email": "bulk-one@example.com",
                "password": "StrongPass!123",
                "role": UserProfile.ROLE_STAGIAIRE,
                "matricule": "S-BULK-1",
                "corps_id": self.corps.id_corps,
                "rank_id": self.rank.id_rank,
                "speciality_id": self.speciality.id_speciality,
            },
            format="json",
        )
        self.assertEqual(create_account_response.status_code, status.HTTP_201_CREATED)

        csv_content = (
            f"username,email,password,role,matricule,est_civil,corps_id,rank_id,speciality_id\n"
            f"bulk-two,bulk-two@example.com,StrongPass!123,Coordinateur,S-BULK-2,false,{self.corps.id_corps},{self.rank.id_rank},{self.speciality.id_speciality}\n"
        )
        bulk_response = self.client.post(
            "/api/admin/accounts/bulk-csv/",
            {"csv_content": csv_content},
            format="json",
        )
        self.assertEqual(bulk_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(bulk_response.data["created_count"], 1)

        refs_response = self.client.get("/api/admin/references/")
        self.assertEqual(refs_response.status_code, status.HTTP_200_OK)
        self.assertIn("corps", refs_response.data)
        self.assertIn("ranks", refs_response.data)
        self.assertIn("specialities", refs_response.data)

        subject_response = self.client.post("/api/admin/subjects/", {"label": "Geometrie"}, format="json")
        self.assertEqual(subject_response.status_code, status.HTTP_201_CREATED)
        subject_id = subject_response.data["id"]

        course = Cours.objects.create(titre="Geo 101", instructeur=instructeur, specialite_id=subject_id)
        control = Controle.objects.create(cours=course, instructeur=instructeur, nom="Ctrl Geo", statut=Controle.STATUT_BROUILLON)

        controls_response = self.client.get(f"/api/admin/subjects/{subject_id}/controls/")
        self.assertEqual(controls_response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(controls_response.data["controls"]), 1)

        status_response = self.client.post(
            f"/api/admin/controls/{control.id_controle}/status/",
            {"status": Controle.STATUT_PUBLIE},
            format="json",
        )
        self.assertEqual(status_response.status_code, status.HTTP_200_OK)
        courses_response = self.client.get(f"/api/admin/subjects/{subject_id}/courses/")
        self.assertEqual(courses_response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(courses_response.data["courses"]), 1)
        course_status_response = self.client.post(
            f"/api/admin/courses/{course.id_cours}/status/",
            {"status": Cours.STATUT_ARCHIVE},
            format="json",
        )
        self.assertEqual(course_status_response.status_code, status.HTTP_200_OK)

        events_response = self.client.get("/api/admin/events/")
        self.assertEqual(events_response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(events_response.data["events"]), 1)
        self.assertGreaterEqual(EventAudit.objects.count(), 1)


class BootstrapAdminCommandTests(TestCase):
    def test_bootstrap_admin_creates_user_and_profile(self):
        call_command(
            "bootstrap_admin",
            username="bootstrap-admin",
            email="bootstrap@example.com",
            password="StrongPass!123",
            matricule="ADM-900",
        )

        user = get_user_model().objects.get(username="bootstrap-admin")
        self.assertTrue(user.is_staff)
        self.assertTrue(user.is_superuser)
        self.assertTrue(user.is_active)
        self.assertEqual(user.email, "bootstrap@example.com")
        self.assertTrue(user.check_password("StrongPass!123"))
        self.assertEqual(user.profile.role, UserProfile.ROLE_ADMIN)
        self.assertEqual(user.profile.matricule, "ADM-900")

    def test_bootstrap_admin_is_idempotent(self):
        call_command(
            "bootstrap_admin",
            username="bootstrap-admin",
            email="bootstrap@example.com",
            password="StrongPass!123",
            matricule="ADM-900",
        )
        call_command(
            "bootstrap_admin",
            username="bootstrap-admin",
            email="bootstrap-updated@example.com",
            password="NewStrongPass!456",
            matricule="ADM-901",
        )

        self.assertEqual(get_user_model().objects.filter(username="bootstrap-admin").count(), 1)
        user = get_user_model().objects.get(username="bootstrap-admin")
        self.assertEqual(user.email, "bootstrap-updated@example.com")
        self.assertTrue(user.check_password("NewStrongPass!456"))
        self.assertEqual(user.profile.role, UserProfile.ROLE_ADMIN)
        self.assertEqual(user.profile.matricule, "ADM-901")
