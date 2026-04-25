#!/usr/bin/env python3
"""Generate PDF report for PFS platform documentation."""

import sys
import os

def try_reportlab():
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import cm
    from reportlab.lib import colors
    from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table,
                                     TableStyle, PageBreak, HRFlowable)
    from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY

    OUTPUT = os.path.join(os.path.dirname(__file__), "RAPPORT_TECHNIQUE_PFS.pdf")
    doc = SimpleDocTemplate(OUTPUT, pagesize=A4,
                            rightMargin=2*cm, leftMargin=2*cm,
                            topMargin=2*cm, bottomMargin=2*cm)

    W = A4[0] - 4*cm

    # ── STYLES ──────────────────────────────────────────────────────────────
    styles = getSampleStyleSheet()

    def S(name, **kw):
        return ParagraphStyle(name, **kw)

    cover_title = S("CoverTitle", fontSize=32, textColor=colors.white,
                    alignment=TA_CENTER, spaceAfter=8, fontName="Helvetica-Bold")
    cover_sub   = S("CoverSub",   fontSize=14, textColor=colors.HexColor("#c0d8f5"),
                    alignment=TA_CENTER, spaceAfter=6)
    cover_meta  = S("CoverMeta",  fontSize=10, textColor=colors.HexColor("#90b8e0"),
                    alignment=TA_CENTER, spaceAfter=4)

    h1 = S("H1", fontSize=15, fontName="Helvetica-Bold",
            textColor=colors.white, spaceBefore=4, spaceAfter=6)
    h2 = S("H2", fontSize=12, fontName="Helvetica-Bold",
            textColor=colors.HexColor("#0f2952"), spaceBefore=14, spaceAfter=5,
            borderPadding=(0,0,0,8),
            leftIndent=8)
    h3 = S("H3", fontSize=10.5, fontName="Helvetica-Bold",
            textColor=colors.HexColor("#1a4a8a"), spaceBefore=8, spaceAfter=4,
            leftIndent=4)
    body = S("Body", fontSize=9.5, leading=14, spaceAfter=5,
             textColor=colors.HexColor("#333333"))
    code_s = S("Code", fontSize=8.5, fontName="Courier",
               backColor=colors.HexColor("#f4f4f4"), leading=12,
               leftIndent=8, rightIndent=8, spaceBefore=4, spaceAfter=4)
    note_s = S("Note", fontSize=9, leading=13, spaceAfter=4,
               backColor=colors.HexColor("#eff6ff"),
               textColor=colors.HexColor("#1e3a5f"),
               leftIndent=6, rightIndent=6)
    warn_s = S("Warn", fontSize=9, leading=13, spaceAfter=4,
               backColor=colors.HexColor("#fffbeb"),
               textColor=colors.HexColor("#713f12"),
               leftIndent=6, rightIndent=6)

    # ── TABLE HELPER ─────────────────────────────────────────────────────────
    DARK   = colors.HexColor("#0f2952")
    LIGHT  = colors.HexColor("#f7f9fd")
    BORDER = colors.HexColor("#d0d8e8")

    def make_table(headers, rows, col_widths=None):
        data = [[Paragraph(f"<b>{h}</b>", S("TH", fontSize=8.5, fontName="Helvetica-Bold",
                                             textColor=colors.white))
                 for h in headers]]
        for row in rows:
            data.append([Paragraph(str(c), S("TD", fontSize=8.5, leading=12,
                                              textColor=colors.HexColor("#222")))
                         for c in row])
        if col_widths is None:
            col_widths = [W / len(headers)] * len(headers)
        t = Table(data, colWidths=col_widths, repeatRows=1)
        style = [
            ("BACKGROUND", (0,0), (-1,0), DARK),
            ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, LIGHT]),
            ("GRID", (0,0), (-1,-1), 0.4, BORDER),
            ("VALIGN", (0,0), (-1,-1), "TOP"),
            ("TOPPADDING", (0,0), (-1,-1), 5),
            ("BOTTOMPADDING", (0,0), (-1,-1), 5),
            ("LEFTPADDING", (0,0), (-1,-1), 6),
        ]
        t.setStyle(TableStyle(style))
        return t

    # ── SECTION HEADER ───────────────────────────────────────────────────────
    def sec_header(num, title, icon=""):
        data = [[Paragraph(f"<b>{icon}  {num}. {title}</b>", h1)]]
        t = Table(data, colWidths=[W])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0,0), (-1,-1), DARK),
            ("ROUNDEDCORNERS", [6]),
            ("TOPPADDING",    (0,0), (-1,-1), 10),
            ("BOTTOMPADDING", (0,0), (-1,-1), 10),
            ("LEFTPADDING",   (0,0), (-1,-1), 14),
        ]))
        return t

    # ── COVER PAGE ───────────────────────────────────────────────────────────
    def cover_page():
        bg = Table([[""]], colWidths=[W+2], rowHeights=[780])
        bg.setStyle(TableStyle([("BACKGROUND", (0,0), (-1,-1), DARK)]))

        items = [
            Spacer(1, 2.5*cm),
            bg,
        ]

        cover_data = [
            [Paragraph("🎓  PLATEFORME PFS", cover_title)],
            [Paragraph("Rapport Technique — Documentation Complète", cover_sub)],
            [Spacer(1, 0.3*cm)],
            [HRFlowable(width=W*0.4, color=colors.HexColor("#4a90d9"), thickness=2)],
            [Spacer(1, 0.3*cm)],
            [Paragraph("Formation par Correspondance — Plateforme d'apprentissage militaire", cover_meta)],
            [Spacer(1, 0.5*cm)],
        ]
        tags_data = [[
            Paragraph("<b>🐍 Django 6.0</b>", S("Tag", fontSize=9, backColor=colors.HexColor("#1a4a8a"),
                                                  textColor=colors.white, alignment=TA_CENTER)),
            Paragraph("<b>⚛️ React 19</b>", S("Tag2", fontSize=9, backColor=colors.HexColor("#1a4a8a"),
                                                textColor=colors.white, alignment=TA_CENTER)),
            Paragraph("<b>🔐 JWT Auth</b>", S("Tag3", fontSize=9, backColor=colors.HexColor("#1a4a8a"),
                                                textColor=colors.white, alignment=TA_CENTER)),
            Paragraph("<b>🗄 SQLite3</b>", S("Tag4", fontSize=9, backColor=colors.HexColor("#1a4a8a"),
                                               textColor=colors.white, alignment=TA_CENTER)),
        ]]
        tags_t = Table(tags_data, colWidths=[W/4]*4)
        tags_t.setStyle(TableStyle([
            ("TOPPADDING",    (0,0), (-1,-1), 6),
            ("BOTTOMPADDING", (0,0), (-1,-1), 6),
            ("LEFTPADDING",   (0,0), (-1,-1), 4),
            ("RIGHTPADDING",  (0,0), (-1,-1), 4),
        ]))

        inner_items = []
        for row in cover_data:
            inner_items.extend(row)
        inner_items.append(tags_t)
        inner_items.append(Spacer(1, 0.5*cm))
        inner_items.append(Paragraph("Rapport généré le 13 Avril 2026  |  Version 1.0  |  Confidentiel", cover_meta))
        return inner_items

    # ── BUILD STORY ─────────────────────────────────────────────────────────
    story = []

    # COVER
    story.append(Table([[""]], colWidths=[W], rowHeights=[2*cm]))
    story[-1].setStyle(TableStyle([("BACKGROUND", (0,0), (-1,-1), DARK)]))
    story.append(Table([[Paragraph("<b>PLATEFORME PFS</b>", S("CT", fontSize=28,
        textColor=colors.white, alignment=TA_CENTER, fontName="Helvetica-Bold"))]],
        colWidths=[W]))
    story[-1].setStyle(TableStyle([("BACKGROUND", (0,0), (-1,-1), DARK),
                                    ("TOPPADDING", (0,0), (-1,-1), 20),
                                    ("BOTTOMPADDING", (0,0), (-1,-1), 10)]))
    story.append(Table([[Paragraph("Rapport Technique — Documentation Complète",
        S("CS", fontSize=13, textColor=colors.HexColor("#90b8e0"), alignment=TA_CENTER))]],
        colWidths=[W]))
    story[-1].setStyle(TableStyle([("BACKGROUND", (0,0), (-1,-1), DARK),
                                    ("BOTTOMPADDING", (0,0), (-1,-1), 10)]))

    badges = [["Django 6.0", "React 19", "JWT / SimpleJWT", "SQLite3", "Docker"]]
    bt = Table(badges, colWidths=[W/5]*5)
    bt.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), colors.HexColor("#1a4a8a")),
        ("TEXTCOLOR",  (0,0), (-1,-1), colors.white),
        ("FONTNAME",   (0,0), (-1,-1), "Helvetica-Bold"),
        ("FONTSIZE",   (0,0), (-1,-1), 8),
        ("ALIGN",      (0,0), (-1,-1), "CENTER"),
        ("TOPPADDING", (0,0), (-1,-1), 8),
        ("BOTTOMPADDING",(0,0),(-1,-1),8),
        ("GRID", (0,0), (-1,-1), 1, DARK),
    ]))
    story.append(Table([[bt]], colWidths=[W]))
    story[-1].setStyle(TableStyle([("BACKGROUND",(0,0),(-1,-1), DARK),
                                    ("LEFTPADDING",(0,0),(-1,-1),0),
                                    ("RIGHTPADDING",(0,0),(-1,-1),0)]))

    story.append(Table([[Paragraph("Formation par Correspondance  |  Rapport généré le 13 Avril 2026  |  Version 1.0",
        S("CM", fontSize=9, textColor=colors.HexColor("#6090c0"), alignment=TA_CENTER))]],
        colWidths=[W]))
    story[-1].setStyle(TableStyle([("BACKGROUND",(0,0),(-1,-1), DARK),
                                    ("TOPPADDING",(0,0),(-1,-1),14),
                                    ("BOTTOMPADDING",(0,0),(-1,-1),20)]))
    story.append(PageBreak())

    # ═══════════════════════════════════════════════
    # SECTION 1 — VUE D'ENSEMBLE
    # ═══════════════════════════════════════════════
    story.append(sec_header(1, "Vue d'ensemble du projet"))
    story.append(Spacer(1, 0.3*cm))
    story.append(Paragraph(
        "Plateforme PFS (Plateforme de Formation par Correspondance) est une application web full-stack "
        "destinée à la gestion de formations militaires et civiles. Elle offre un environnement complet "
        "de e-learning avec gestion des cours, examens, soumissions et évaluations, accessible selon "
        "des rôles bien définis.",
        body))

    stats = [["25\nModèles BD", "60+\nEndpoints API", "5\nRôles", "16\nMigrations"]]
    st = Table(stats, colWidths=[W/4]*4)
    st.setStyle(TableStyle([
        ("BACKGROUND",(0,0),(-1,-1), colors.HexColor("#eff6ff")),
        ("TEXTCOLOR",(0,0),(-1,-1), colors.HexColor("#1d4ed8")),
        ("FONTNAME",(0,0),(-1,-1), "Helvetica-Bold"),
        ("FONTSIZE",(0,0),(-1,-1), 14),
        ("ALIGN",(0,0),(-1,-1),"CENTER"),
        ("VALIGN",(0,0),(-1,-1),"MIDDLE"),
        ("TOPPADDING",(0,0),(-1,-1),14),
        ("BOTTOMPADDING",(0,0),(-1,-1),14),
        ("BOX",(0,0),(-1,-1),1, colors.HexColor("#bfdbfe")),
        ("INNERGRID",(0,0),(-1,-1),0.5, colors.HexColor("#bfdbfe")),
    ]))
    story.append(st)
    story.append(Spacer(1, 0.3*cm))

    story.append(Paragraph("Objectifs de la plateforme", h2))
    story.append(make_table(
        ["Fonctionnalité", "Description"],
        [
            ["Gestion des cours", "Création, publication et archivage de cours organisés en modules et matières"],
            ["Contrôles & Examens", "Création d'épreuves avec délai, soumission de réponses et correction notée sur 20"],
            ["Gestion des classes", "Organisation des stagiaires en brigades et classes avec affectation des instructeurs"],
            ["Stages de fin d'études", "Proposition et attribution de sujets de stage avec suivi d'avancement"],
            ["Notifications", "Système de notifications automatiques (nouveaux cours, corrections publiées)"],
            ["Audit & Traçabilité", "Journal complet des événements système pour la supervision"],
            ["Rapports", "Export Excel des données de la plateforme par le coordinateur"],
            ["Internationalisation", "Interface disponible en Français et Anglais"],
        ],
        [W*0.28, W*0.72]
    ))
    story.append(PageBreak())

    # ═══════════════════════════════════════════════
    # SECTION 2 — STACK TECHNOLOGIQUE
    # ═══════════════════════════════════════════════
    story.append(sec_header(2, "Stack technologique"))
    story.append(Spacer(1, 0.3*cm))

    story.append(Paragraph("Backend", h2))
    story.append(make_table(
        ["Technologie", "Version", "Rôle"],
        [
            ["Python", "3.12+", "Langage principal"],
            ["Django", "6.0.1", "Framework web"],
            ["Django REST Framework", "3.16.1", "API REST"],
            ["djangorestframework-simplejwt", "5.5.1", "Authentification JWT"],
            ["django-cors-headers", "4.9.0", "Gestion CORS"],
            ["openpyxl", "3.1+", "Export Excel"],
            ["SQLite3", "—", "Base de données (développement)"],
            ["Poetry", "—", "Gestionnaire de dépendances"],
        ],
        [W*0.38, W*0.2, W*0.42]
    ))

    story.append(Paragraph("Frontend", h2))
    story.append(make_table(
        ["Technologie", "Version", "Rôle"],
        [
            ["React", "19.2.0", "Framework UI"],
            ["TypeScript", "5.9", "Typage statique"],
            ["Vite", "7.3.1", "Build tool & dev server"],
            ["React Router DOM", "7.13.1", "Routing SPA"],
            ["Material-UI (MUI)", "7.3.9", "Composants UI"],
            ["Recharts", "3.8.1", "Graphiques & analytics"],
            ["i18next", "25.8.17", "Internationalisation FR/EN"],
            ["Tailwind CSS", "3.4.17", "Utilitaires CSS"],
            ["pdfjs-dist", "5.5.207", "Lecture de fichiers PDF"],
        ],
        [W*0.38, W*0.2, W*0.42]
    ))
    story.append(PageBreak())

    # ═══════════════════════════════════════════════
    # SECTION 3 — BASE DE DONNÉES
    # ═══════════════════════════════════════════════
    story.append(sec_header(3, "Base de données — Modèles & Relations"))
    story.append(Spacer(1, 0.3*cm))

    story.append(Paragraph("Configuration", h2))
    story.append(Paragraph("Moteur : SQLite3  |  Fichier : backend/db.sqlite3  |  Clés primaires : UUID (50 chars)", code_s))
    story.append(Paragraph("⚠ SQLite3 est adapté au développement. Migrer vers PostgreSQL pour la production.", warn_s))

    story.append(Paragraph("Groupe 1 — Utilisateurs", h2))
    story.append(make_table(
        ["Modèle", "Champs principaux", "Description"],
        [
            ["UserProfile", "user (1:1 User), role, matricule, est_civil, corps(FK), rank(FK), speciality(FK)",
             "Extension du User Django. Rôles : Instructeur, Stagiaire, Admin, Superviseur, Coordinateur"],
            ["InstructeurProfil", "user (1:1), bio, photo_profil, experience_annees",
             "Profil détaillé des instructeurs"],
        ],
        [W*0.2, W*0.45, W*0.35]
    ))

    story.append(Paragraph("Groupe 2 — Structure organisationnelle", h2))
    story.append(make_table(
        ["Modèle", "Champs principaux", "Description"],
        [
            ["Corps", "id_corps, nom, code", "Corps militaire (Infanterie, Artillerie…)"],
            ["Rank", "id_rank, nom, code, corps(FK)", "Grade militaire lié à un corps"],
            ["Speciality", "id_speciality, nom, code, corps(FK)", "Spécialité technique liée à un corps"],
            ["Brigade", "id_brigade, nom, code, annee_formation", "Brigade / Bataillon de formation"],
            ["Classe", "id_classe, nom, code, brigade(FK)", "Classe rattachée à une brigade"],
            ["StagiaireClasse", "stagiaire(FK), classe(FK), date_debut, date_fin, actif",
             "Inscription d'un stagiaire à une classe avec période"],
            ["AffectationInstructeurClasse", "instructeur(FK), classe(FK), matiere(FK), date_debut, date_fin",
             "Affectation d'un instructeur à une classe pour une matière"],
        ],
        [W*0.27, W*0.4, W*0.33]
    ))

    story.append(Paragraph("Groupe 3 — Contenu pédagogique", h2))
    story.append(make_table(
        ["Modèle", "Champs principaux", "Description"],
        [
            ["Module", "id_module, nom, code, description, ordre", "Module de formation (niveau supérieur)"],
            ["Matiere", "id_matiere, nom, code, module(FK), coefficient, ordre",
             "Matière/discipline liée à un module"],
            ["Brochure", "id_brochure, titre, fichier, matiere(FK), ordre", "Document de référence par matière"],
            ["Cours", "id_cours, titre, description, instructeur(FK), matiere(FK), statut, date_depot",
             "Cours créé par instructeur. Statuts : BROUILLON / PUBLIE / ARCHIVE"],
            ["CoursFichier", "cours(FK), fichier(FileField), nom_fichier, mime_type, taille_octets",
             "Fichiers du cours — stockés sur disque dans media/cours_fichiers/"],
            ["SessionCours", "cours(FK), classe(FK), date_debut, date_fin, duree_minutes, salle",
             "Séance planifiée d'un cours dans une classe"],
            ["Inscription", "stagiaire(FK), cours(FK), date_inscription, statut",
             "Inscription d'un stagiaire. Statuts : ACTIVE / SUSPENDUE / TERMINEE / ANNULEE"],
        ],
        [W*0.22, W*0.43, W*0.35]
    ))
    story.append(PageBreak())

    story.append(Paragraph("Groupe 4 — Évaluations", h2))
    story.append(make_table(
        ["Modèle", "Champs principaux", "Description"],
        [
            ["Controle", "titre, cours(FK), instructeur(FK), date_limite, bareme, enonce, fichier_enonce(Binary), statut",
             "Contrôle / examen. Statuts : BROUILLON / PUBLIE / CLOTURE / CORRIGE"],
            ["SoumissionControle", "controle(FK), stagiaire(FK), date_soumission, fichier_reponse(Binary), statut",
             "Réponse d'un stagiaire. Statuts : BROUILLON / SOUMIS / RETARD / ANNULE"],
            ["Evaluation", "soumission(FK), instructeur(FK), note (0–20), correction, est_publiee",
             "Note attribuée à une soumission (échelle 0–20)"],
            ["ControleCorrection", "controle(FK), instructeur(FK), version_no, titre, texte_correction, fichier_correction(Binary)",
             "Corrigé officiel d'un contrôle avec versioning"],
        ],
        [W*0.22, W*0.48, W*0.30]
    ))

    story.append(Paragraph("Groupe 5 — Stages & Système", h2))
    story.append(make_table(
        ["Modèle", "Champs principaux", "Description"],
        [
            ["SujetFinStage", "titre, description, instructeur(FK), annee, specialite, statut",
             "Sujet de stage. Statuts : PROPOSE / VALIDE / ANNULE"],
            ["AffectationSujetStage", "sujet(FK), stagiaire(1:1), encadrant(FK), date_affectation, etat",
             "Attribution d'un sujet à un stagiaire (unique)"],
            ["Notification", "destinataire(FK), type_notification, titre, message, est_lue, date_creation",
             "Notifications in-app pour les utilisateurs"],
            ["EventAudit", "actor(FK), event_type, target_type, target_id, metadata(JSON), timestamp, ip_address",
             "Journal d'audit — toutes les actions critiques du système"],
        ],
        [W*0.22, W*0.48, W*0.30]
    ))
    story.append(PageBreak())

    # ═══════════════════════════════════════════════
    # SECTION 4 — API REST
    # ═══════════════════════════════════════════════
    story.append(sec_header(4, "API REST — Endpoints complets (60+)"))
    story.append(Spacer(1, 0.3*cm))

    def ep_table(rows):
        return make_table(["Méthode", "Endpoint", "Description / Accès"], rows, [W*0.12, W*0.38, W*0.50])

    story.append(Paragraph("Authentification & Profil", h2))
    story.append(ep_table([
        ["POST", "/api/token/", "Connexion — retourne access_token + refresh_token"],
        ["POST", "/api/token/refresh/", "Renouveler l'access token expiré"],
        ["POST", "/api/signup/", "Inscription d'un nouveau compte"],
        ["GET",  "/api/me/", "Profil de l'utilisateur connecté"],
        ["GET",  "/api/health/", "Vérification de l'état du serveur"],
        ["GET",  "/api/references/", "Données de référence publiques (corps, grades, spécialités)"],
    ]))

    story.append(Paragraph("Tableaux de bord", h2))
    story.append(ep_table([
        ["GET", "/api/dashboard/instructeur/", "Instructeur"],
        ["GET", "/api/dashboard/stageaire/", "Stagiaire"],
        ["GET", "/api/dashboard/superviseur/", "Superviseur"],
        ["GET", "/api/dashboard/coordinateur/", "Coordinateur"],
        ["GET", "/api/dashboard/admin/", "Admin"],
    ]))

    story.append(Paragraph("Gestion des cours (Instructeur)", h2))
    story.append(ep_table([
        ["POST",   "/api/instructeur/cours/", "Créer un cours"],
        ["DELETE", "/api/instructeur/cours/<id>/delete/", "Supprimer un cours"],
        ["POST",   "/api/instructeur/cours/<id>/fichier/", "Uploader un fichier de cours (Base64)"],
        ["GET",    "/api/instructeur/cours/<id>/fichier/", "Lister les fichiers d'un cours"],
        ["GET",    "/api/instructeur/cours/<id>/fichier/<fid>/", "Télécharger un fichier de cours"],
    ]))

    story.append(Paragraph("Contrôles & Évaluations (Instructeur)", h2))
    story.append(ep_table([
        ["POST",   "/api/instructeur/controles/", "Créer un contrôle / examen"],
        ["DELETE", "/api/instructeur/controles/<id>/delete/", "Supprimer un contrôle"],
        ["POST",   "/api/instructeur/controles/<id>/fichier/", "Uploader l'énoncé (Base64)"],
        ["GET",    "/api/instructeur/controles/<id>/fichier/", "Télécharger l'énoncé"],
        ["POST",   "/api/instructeur/soumissions/<id>/evaluate/", "Noter une soumission (0–20)"],
        ["GET",    "/api/instructeur/soumissions/<id>/fichier/", "Télécharger la réponse d'un stagiaire"],
        ["POST",   "/api/instructeur/controles/<id>/publish-correction/", "Publier le corrigé officiel"],
    ]))
    story.append(PageBreak())

    story.append(Paragraph("Soumissions & Cours (Stagiaire)", h2))
    story.append(ep_table([
        ["POST", "/api/stageaire/controls/<id>/submit/", "Soumettre une réponse au contrôle"],
        ["GET",  "/api/stageaire/controles/<id>/fichier/", "Télécharger l'énoncé d'un contrôle"],
        ["GET",  "/api/stageaire/cours/<id>/fichier/<fid>/", "Télécharger un document de cours"],
        ["GET",  "/api/modules/", "Lister tous les modules"],
        ["GET",  "/api/stageaire/modules/", "Modules accessibles au stagiaire"],
        ["GET",  "/api/stageaire/modules/<id>/cours/", "Cours d'un module"],
        ["GET",  "/api/stageaire/matieres/<id>/cours/", "Cours d'une matière"],
        ["GET",  "/api/stageaire/cours/<id>/", "Détail d'un cours"],
        ["GET",  "/api/stageaire/classement/", "Classement personnel du stagiaire"],
    ]))

    story.append(Paragraph("Administration", h2))
    story.append(ep_table([
        ["POST",   "/api/admin/accounts/create/", "Créer un compte utilisateur"],
        ["POST",   "/api/admin/accounts/bulk-csv/", "Import en masse via CSV"],
        ["POST",   "/api/admin/users/<id>/toggle-active/", "Activer / désactiver un compte"],
        ["POST",   "/api/admin/users/<id>/reset-password/", "Réinitialiser le mot de passe"],
        ["POST",   "/api/admin/users/<id>/send-password-email/", "Envoyer le mot de passe par email"],
        ["GET",    "/api/admin/classes/", "Lister toutes les classes"],
        ["POST",   "/api/admin/classes/", "Créer une classe"],
        ["POST",   "/api/admin/classes/<id>/assign-stageaire/", "Inscrire un stagiaire dans une classe"],
        ["POST",   "/api/admin/classes/<id>/assign-instructeur/", "Affecter un instructeur à une classe"],
        ["DELETE", "/api/admin/classes/<id>/delete/", "Supprimer une classe"],
        ["GET",    "/api/admin/subjects/", "Lister toutes les matières"],
        ["POST",   "/api/admin/subjects/", "Créer une matière"],
        ["GET",    "/api/admin/references/", "Toutes les données de référence (Admin)"],
        ["POST",   "/api/admin/controls/<id>/status/", "Mettre à jour le statut d'un contrôle"],
        ["POST",   "/api/admin/courses/<id>/status/", "Mettre à jour le statut d'un cours"],
        ["GET",    "/api/admin/events/", "Journal d'audit complet"],
        ["GET",    "/api/admin/classement/", "Classement général de tous les stagiaires"],
        ["GET",    "/api/coordinateur/report/export/", "Export Excel du rapport (Coordinateur)"],
    ]))
    story.append(PageBreak())

    # ═══════════════════════════════════════════════
    # SECTION 5 — AUTHENTIFICATION JWT
    # ═══════════════════════════════════════════════
    story.append(sec_header(5, "Authentification JWT & Sessions"))
    story.append(Spacer(1, 0.3*cm))

    story.append(Paragraph("Configuration (settings.py)", h2))
    story.append(Paragraph(
        'REST_FRAMEWORK = {"DEFAULT_AUTHENTICATION_CLASSES": '
        '("rest_framework_simplejwt.authentication.JWTAuthentication",), '
        '"DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.AllowAny",)}', code_s))
    story.append(Paragraph(
        'SIMPLE_JWT = {"ACCESS_TOKEN_LIFETIME": timedelta(minutes=15), '
        '"REFRESH_TOKEN_LIFETIME": timedelta(days=1)}', code_s))

    story.append(make_table(
        ["Paramètre", "Valeur", "Description"],
        [
            ["Access Token", "15 minutes", "Inclus dans Authorization: Bearer <token>. Court pour la sécurité."],
            ["Refresh Token", "1 jour", "Utilisé pour renouveler l'access token sans re-connexion"],
            ["Algorithme", "HS256", "HMAC-SHA256 avec la SECRET_KEY Django"],
            ["Permission défaut", "AllowAny", "Chaque vue gère ses propres vérifications de rôle"],
        ],
        [W*0.22, W*0.2, W*0.58]
    ))

    story.append(Paragraph("Flux d'authentification", h2))
    story.append(Paragraph(
        "1. POST /api/token/ {username, password}  →  {access_token, refresh_token}\n"
        "2. Requêtes protégées : Authorization: Bearer <access_token>\n"
        "3. Token expiré : POST /api/token/refresh/ {refresh}  →  {access_token nouveau}\n"
        "4. Les tokens sont stockés côté client (localStorage)", code_s))

    story.append(Paragraph("Sessions Django", h2))
    story.append(Paragraph(
        "ℹ La plateforme utilise JWT stateless pour l'API REST (React). "
        "Les sessions Django standard restent actives uniquement pour l'interface "
        "d'administration Django (/admin/).", note_s))
    story.append(make_table(
        ["Paramètre", "Valeur"],
        [
            ["Middleware", "django.contrib.sessions.middleware.SessionMiddleware"],
            ["Moteur", "Base de données (table django_session)"],
            ["Durée", "2 semaines (défaut Django)"],
            ["CSRF", "Activé via django.middleware.csrf.CsrfViewMiddleware"],
        ],
        [W*0.35, W*0.65]
    ))
    story.append(PageBreak())

    # ═══════════════════════════════════════════════
    # SECTION 6 — RÉINITIALISATION MDP
    # ═══════════════════════════════════════════════
    story.append(sec_header(6, "Réinitialisation du mot de passe"))
    story.append(Spacer(1, 0.3*cm))

    story.append(Paragraph("Réinitialisation directe (Admin)", h2))
    story.append(Paragraph("POST /api/admin/users/<id>/reset-password/   Body: {\"password\": \"NouveauMdp\"}", code_s))
    story.append(make_table(
        ["Étape", "Action"],
        [
            ["1", "Vérification que l'utilisateur connecté est Admin"],
            ["2", "Récupération de l'utilisateur cible par user_id"],
            ["3", "user.set_password() — hachage automatique PBKDF2"],
            ["4", "Enregistrement d'un EventAudit avec action reset_password"],
        ],
        [W*0.08, W*0.92]
    ))

    story.append(Paragraph("Envoi par email (Admin)", h2))
    story.append(Paragraph("POST /api/admin/users/<id>/send-password-email/", code_s))
    story.append(Paragraph(
        "Génération : 12 caractères aléatoires (ascii_letters + digits + \"!@#$%&\")\n"
        "Expéditeur : PFS Platform <no-reply@pfs.local>\n"
        "Backend actuel : Console (développement — emails affichés dans le terminal)", code_s))
    story.append(Paragraph("⚠ Pour la production : configurer EMAIL_BACKEND = smtp.EmailBackend dans settings.py", warn_s))

    story.append(Paragraph("Règles de validation du mot de passe", h2))
    story.append(make_table(
        ["Validateur", "Règle appliquée"],
        [
            ["UserAttributeSimilarityValidator", "Ne doit pas être similaire au nom, email ou username de l'utilisateur"],
            ["MinimumLengthValidator", "Longueur minimale : 8 caractères"],
            ["CommonPasswordValidator", "Interdit les 20 000 mots de passe courants de la liste Django"],
            ["NumericPasswordValidator", "Le mot de passe ne peut pas être entièrement numérique"],
        ],
        [W*0.45, W*0.55]
    ))
    story.append(PageBreak())

    # ═══════════════════════════════════════════════
    # SECTION 7 — FICHIERS
    # ═══════════════════════════════════════════════
    story.append(sec_header(7, "Gestion des fichiers"))
    story.append(Spacer(1, 0.3*cm))

    story.append(Paragraph("Formats acceptés & Types MIME", h2))
    story.append(Paragraph("⚠ Aucune restriction serveur : le type MIME est enregistré tel qu'envoyé par le client. Aucune validation de format n'est appliquée côté serveur.", warn_s))
    story.append(make_table(
        ["Catégorie", "Formats", "Type MIME", "Usage"],
        [
            ["Documents PDF", "PDF", "application/pdf", "Énoncés, corrections, brochures"],
            ["Texte enrichi", "RTF", "application/rtf", "Type par défaut de la plateforme"],
            ["Microsoft Office", "DOCX, XLSX, PPTX", "application/vnd.openxmlformats-officedocument.*", "Cours, soumissions"],
            ["Images", "PNG, JPG, GIF", "image/png, image/jpeg", "Pièces jointes"],
            ["Archives", "ZIP, RAR", "application/zip", "Dossiers de cours"],
            ["Texte brut", "TXT, CSV", "text/plain", "Données textuelles"],
        ],
        [W*0.18, W*0.18, W*0.35, W*0.29]
    ))

    story.append(Paragraph("Taille maximale des fichiers", h2))
    story.append(make_table(
        ["Paramètre", "Valeur", "Note"],
        [
            ["DATA_UPLOAD_MAX_MEMORY_SIZE", "2.5 MB (défaut Django)", "Non défini dans settings.py"],
            ["FILE_UPLOAD_MAX_MEMORY_SIZE", "2.5 MB (défaut Django)", "Non défini dans settings.py"],
            ["Overhead encodage Base64", "+33%", "Fichiers encodés avant envoi HTTP"],
            ["Taille effective maximum", "~1.87 MB", "2.5 MB ÷ 1.33"],
        ],
        [W*0.38, W*0.25, W*0.37]
    ))

    story.append(Paragraph("Emplacement de stockage", h2))
    story.append(make_table(
        ["Méthode", "Modèle(s)", "Chemin / Champ", "Recommandation"],
        [
            ["FileField (disque)", "CoursFichier", "backend/media/cours_fichiers/\nURL : /media/cours_fichiers/<nom>",
             "Recommandé en production"],
            ["BinaryField (base de données)", "Controle, SoumissionControle, ControleCorrection",
             "Champs : fichier_enonce, fichier_reponse, fichier_correction",
             "Déconseillé en production"],
        ],
        [W*0.22, W*0.28, W*0.33, W*0.17]
    ))

    story.append(Paragraph("Configuration media (settings.py)", h2))
    story.append(Paragraph('MEDIA_ROOT = BASE_DIR / "media"   |   MEDIA_URL = "/media/"', code_s))
    story.append(PageBreak())

    # ═══════════════════════════════════════════════
    # SECTION 8 — RÔLES & PERMISSIONS
    # ═══════════════════════════════════════════════
    story.append(sec_header(8, "Rôles & Permissions"))
    story.append(Spacer(1, 0.3*cm))

    story.append(make_table(
        ["Rôle", "Accès", "Permissions principales", "Création compte"],
        [
            ["Admin", "Contrôle total",
             "Gestion des comptes, classes, données de référence, audit, classements",
             "Commande bootstrap_admin uniquement"],
            ["Superviseur", "Surveillance",
             "Monitoring, statistiques, gestion corps/grades/spécialités",
             "Signup public"],
            ["Coordinateur", "Rapports",
             "Export Excel des données de la plateforme",
             "Signup public"],
            ["Instructeur", "Enseignement",
             "Créer/publier cours et contrôles, noter soumissions, publier corrigés",
             "Signup public"],
            ["Stagiaire", "Apprentissage",
             "Consulter cours, soumettre réponses, voir notes et classement",
             "Signup public"],
        ],
        [W*0.15, W*0.15, W*0.45, W*0.25]
    ))

    story.append(Paragraph("Règles spéciales", h2))
    story.append(make_table(
        ["Règle", "Détail"],
        [
            ["Civil vs Militaire", "Civil (est_civil=True) : matricule non requis, pas de corps obligatoire. Militaire : matricule + corps requis."],
            ["Vérification des rôles", "Chaque vue Django vérifie profile.role. Permission par défaut : AllowAny."],
            ["Admin Django", "Réservé aux is_superuser=True. L'Admin PFS ≠ superuser Django."],
            ["Inscription Admin", "Impossible via signup. Créé uniquement via manage.py bootstrap_admin."],
        ],
        [W*0.30, W*0.70]
    ))
    story.append(PageBreak())

    # ═══════════════════════════════════════════════
    # SECTION 9 — CONFIGURATION DÉPLOIEMENT
    # ═══════════════════════════════════════════════
    story.append(sec_header(9, "Configuration & Déploiement"))
    story.append(Spacer(1, 0.3*cm))

    story.append(Paragraph("Variables d'environnement", h2))
    story.append(make_table(
        ["Variable", "Défaut", "Usage"],
        [
            ["DJANGO_ADMIN_USERNAME", "admin", "Nom du compte admin initial"],
            ["DJANGO_ADMIN_EMAIL", "admin@example.com", "Email du compte admin"],
            ["DJANGO_ADMIN_PASSWORD", "REQUIS", "Mot de passe admin — obligatoire"],
            ["DJANGO_ADMIN_MATRICULE", "ADM-0001", "Matricule de l'admin"],
            ["VITE_API_BASE_URL", "http://127.0.0.1:8000", "URL de l'API Django (frontend)"],
        ],
        [W*0.38, W*0.22, W*0.40]
    ))

    story.append(Paragraph("CORS & Ports", h2))
    story.append(Paragraph(
        "CORS_ALLOWED_ORIGINS = [\"http://127.0.0.1:5173\", \"http://localhost:5173\"]\n"
        "Backend : port 8000  |  Frontend Vite : port 5173  |  Docker : mêmes ports exposés", code_s))

    story.append(Paragraph("Checklist mise en production", h2))
    story.append(make_table(
        ["Point", "Action recommandée", "Priorité"],
        [
            ["Base de données", "Migrer de SQLite3 vers PostgreSQL", "CRITIQUE"],
            ["Email", "Configurer SMTP réel dans settings.py", "CRITIQUE"],
            ["SECRET_KEY", "Utiliser une clé forte en variable d'environnement", "CRITIQUE"],
            ["DEBUG", "Passer DEBUG=False en production", "CRITIQUE"],
            ["Fichiers", "Remplacer BinaryField par FileField ou stockage cloud (S3)", "IMPORTANT"],
            ["Taille fichiers", "Définir DATA_UPLOAD_MAX_MEMORY_SIZE", "IMPORTANT"],
            ["Validation MIME", "Ajouter validation des types de fichiers côté serveur", "IMPORTANT"],
            ["CORS", "Restreindre aux domaines de production uniquement", "RECOMMANDÉ"],
        ],
        [W*0.20, W*0.60, W*0.20]
    ))

    # BUILD PDF
    doc.build(story)
    return OUTPUT


if __name__ == "__main__":
    print("Génération du PDF en cours...")
    try:
        out = try_reportlab()
        print(f"SUCCESS: PDF créé -> {out}")
    except ImportError:
        print("ERROR: reportlab non installé. Lancez: pip install reportlab")
        sys.exit(1)
    except Exception as e:
        print(f"ERROR: {e}")
        import traceback; traceback.print_exc()
        sys.exit(1)
