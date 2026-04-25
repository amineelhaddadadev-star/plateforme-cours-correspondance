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
          settings: "Parametres",
          logout: "Deconnexion",
        },
        titles: {
          appName: "Plateforme de cours par correspondance",
          home: "Accueil",
          login: "Connexion",
          signup: "Inscription",
          settings: "Parametres",
          dashboard: "Tableau de bord",
          adminWorkspace: "Espace Administration",
          instructorDashboard: "Tableau Instructeur",
          traineeDashboard: "Tableau Stagiaire",
          coordinatorDashboard: "Tableau Coordonnateur",
          adminOverview: "Vue generale",
          adminUsers: "Utilisateurs",
          adminUserDetails: "Detail utilisateur",
          adminAccounts: "Comptes",
          adminSubjects: "Sujets",
          adminSubjectsControls: "Sujets - Controles",
          adminSubjectsCourses: "Sujets - Cours",
          adminClasses: "Classes",
        },
        workspace: {
          Instructeur: {
            title: "Espace Instructeur",
            summary: "Suivez les sessions, creez les evaluations et accompagnez la progression des stagiaires.",
          },
          Stagiaire: {
            title: "Espace Stagiaire",
            summary: "Suivez votre parcours, vos jalons et vos prochaines evaluations.",
          },
          Admin: {
            title: "Espace Administration",
            summary: "Pilotez la plateforme, les utilisateurs et les operations globales.",
          },
          Coordinateur: {
            title: "Espace Coordonnateur",
            summary: "Coordonnez la planification et le suivi transverse des activites.",
          },
        },
        admin: {
          panelTitle: "Panneau Admin",
          navOverview: "Vue generale",
          navUsers: "Utilisateurs",
          navAccounts: "Comptes",
          navSubjects: "Sujets",
          navClasses: "Classes",
        },
        home: {
          badge: "Plateforme de formation entreprise",
          title: "Un espace moderne pour les personnes, les programmes et la progression.",
          subtitle:
            "Collaboration unifiee entre Instructeurs, Stagiaires, Admins et Coordinateurs.",
          ctaLogin: "Acceder a la plateforme",
          ctaSignup: "Creer un compte",
          highlightsTitle: "Points forts de la plateforme",
          highlight1: "Tableau de bord dynamique selon le role.",
          highlight2: "Authentification securisee avec gestion du cycle JWT.",
          highlight3: "Stack rapide avec Django REST et React + Vite.",
        },
        login: {
          title: "Connexion",
          subtitle: "Connectez-vous pour acceder a votre espace.",
          submit: "Se connecter",
          loading: "Connexion en cours...",
        },
        signup: {
          title: "Inscription",
          subtitle: "Creez un compte et choisissez votre profil.",
          profile: "Profil",
          submit: "Creer un compte",
          loading: "Creation du compte...",
        },
        dashboard: {
          badge: "Tableau de bord",
          profileContext: "Contexte du profil",
          user: "Utilisateur",
          email: "Email",
          role: "Role",
          matricule: "Matricule",
          noEmail: "Non renseigne",
          noMatricule: "Aucun (Instructeur civil)",
          generatedAction: "Action generee selon votre role actuel.",
        },
        settings: {
          title: "Parametres",
          subtitle: "Personnalisez les preferences de votre espace.",
          accountTitle: "Session",
          accountConnected: "Connecte en tant que",
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
          sessionExpired: "Session expiree. Connectez-vous de nouveau.",
          profileLoadFailed: "Impossible de charger le profil.",
          signupFailed: "Inscription echouee. Le nom d'utilisateur existe peut-etre deja.",
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
