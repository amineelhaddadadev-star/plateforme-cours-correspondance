import i18n from "i18next";
import { initReactI18next } from "react-i18next";

void i18n.use(initReactI18next).init({
  resources: {
    fr: {
      translation: {
        nav: {
          brand: "Plateforme de cours par correspondance",
          home: "Accueil",
          dashboard: "Tableau de bord",
          login: "Connexion",
          signup: "Inscription",
          settings: "Paramètres",
          logout: "Déconnexion",
        },
        titles: {
          appName: "Plateforme de cours par correspondance",
          home: "Accueil",
          login: "Connexion",
          signup: "Inscription",
          settings: "Paramètres",
          dashboard: "Tableau de bord",
          adminWorkspace: "Espace Administration",
          instructorDashboard: "Tableau Instructeur",
          traineeDashboard: "Tableau Stagiaire",
          coordinatorDashboard: "Tableau Coordinateur",
          adminOverview: "Vue générale",
          adminUsers: "Utilisateurs",
          adminUserDetails: "Détail utilisateur",
          adminAccounts: "Comptes",
          adminSubjects: "Sujets",
          adminSubjectsControls: "Sujets - Contrôles",
          adminSubjectsCourses: "Sujets - Cours",
          adminClasses: "Classes",
        },
        workspace: {
          Instructeur: {
            title: "Espace Instructeur",
            summary: "Suivez les sessions, créez les évaluations et accompagnez la progression des stagiaires.",
          },
          Stagiaire: {
            title: "Espace Stagiaire",
            summary: "Suivez votre parcours, vos jalons et vos prochaines évaluations.",
          },
          Admin: {
            title: "Espace Administration",
            summary: "Pilotez la plateforme, les utilisateurs et les opérations globales.",
          },
          Coordinateur: {
            title: "Espace Coordinateur",
            summary: "Coordonnez la planification et le suivi transverse des activités.",
          },
        },
        admin: {
          panelTitle: "Panneau Admin",
          navOverview: "Vue générale",
          navUsers: "Utilisateurs",
          navAccounts: "Comptes",
          navSubjects: "Sujets",
          navClasses: "Classes",
        },
        home: {
          badge: "Plateforme de formation entreprise",
          title: "Un espace moderne pour les personnes, les programmes et la progression.",
          subtitle:
            "Collaboration unifiée entre Instructeurs, Stagiaires, Admins et Coordinateurs.",
          ctaLogin: "Accéder à la plateforme",
          ctaSignup: "Créer un compte",
          highlightsTitle: "Points forts de la plateforme",
          highlight1: "Tableau de bord dynamique selon le rôle.",
          highlight2: "Authentification sécurisée avec gestion du cycle JWT.",
          highlight3: "Stack rapide avec Django REST et React + Vite.",
        },
        login: {
          title: "Connexion",
          subtitle: "Connectez-vous pour accéder à votre espace.",
          submit: "Se connecter",
          loading: "Connexion en cours...",
        },
        signup: {
          title: "Inscription",
          subtitle: "Créez un compte et choisissez votre profil.",
          profile: "Profil",
          submit: "Créer un compte",
          loading: "Création du compte...",
        },
        dashboard: {
          badge: "Tableau de bord",
          profileContext: "Contexte du profil",
          user: "Utilisateur",
          email: "Email",
          role: "Rôle",
          matricule: "Matricule",
          noEmail: "Non renseigné",
          noMatricule: "Aucun (Instructeur civil)",
          generatedAction: "Action générée selon votre rôle actuel.",
        },
        settings: {
          title: "Paramètres",
          subtitle: "Personnalisez les préférences de votre espace.",
          accountTitle: "Session",
          accountConnected: "Connecté en tant que",
          accountDisconnected: "Aucune session active.",
        },
        labels: {
          username: "Nom d'utilisateur",
          password: "Mot de passe",
          email: "Email",
          matriculeRequired: "Matricule (obligatoire pour profils militaires)",
          matriculeOptional: "Matricule (optionnel pour Instructeur civil)",
        },
        errors: {
          invalidCredentials: "Identifiants invalides.",
          sessionExpired: "Session expirée. Connectez-vous de nouveau.",
          profileLoadFailed: "Impossible de charger le profil.",
          signupFailed: "Inscription échouée. Le nom d'utilisateur existe peut-être déjà.",
          matriculeRequired: "Le matricule est obligatoire pour les profils militaires.",
        },
        roles: {
          Instructeur: "Instructeur",
          Stagiaire: "Stagiaire",
          Admin: "Admin",
          Coordinateur: "Coordinateur",
        },
      },
    },
  },
  lng: "fr",
  fallbackLng: "fr",
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
