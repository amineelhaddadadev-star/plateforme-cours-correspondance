import React, { useCallback, useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import PdfViewer, { InlinePdfViewer, InlineDocxViewer } from "./PdfViewer";
import { useTranslation } from "react-i18next";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import InputAdornment from "@mui/material/InputAdornment";
import TextField from "@mui/material/TextField";
import {
  BrowserRouter,
  Link,
  Navigate,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";

type MeResponse = {
  id: number;
  username: string;
  email: string;
  role: Role;
  matricule: string;
  est_civil?: boolean;
  corps?: { id: string; label: string } | null;
  rank?: { id: string; label: string } | null;
  speciality?: { id: string; label: string } | null;
};
type TokenResponse = { access: string; refresh: string };
type RefreshResponse = { access: string };
type Role = "Instructeur" | "Stagiaire" | "Admin" | "Coordinateur";

type InstructeurDashboardData = {
  role: Role;
  classes_count: number;
  classes: Array<{ id: string; code: string; label: string; brigade: string }>;
  cours: { total: number; published: number };
  cours_list: Array<{ id: string; title: string; status: string }>;
  controles: { total: number; published: number; pending_corrections: number };
  controles_list: Array<{ id: string; name: string; status: string; cours_title: string; deadline: string | null }>;
  pending_submissions: Array<{ soumission_id: string; controle_id: string; controle_name: string; stagiaire_id: number; submitted_at: string }>;
  sujets_fin_stage: { total: number; active: number; list: Array<{ sujet: string; stagiaire_id: number; etat: string }> };
  notifications: { unread_count: number; latest: Array<{ id: string; title: string; message: string; type: string; created_at: string }> };
};

type StageaireDashboardData = {
  role: Role;
  classes: Array<{ classe_code: string; classe_label: string; brigade_code: string; brigade_label: string }>;
  cours_list: Array<{ id: string; titre: string; matiere: string; description: string; instructeur: string; controles_count: number }>;
  modules_list: Array<{ id: string; nom: string; matieres: Array<{ id: string; nom: string; cours_count: number }> }>;
  controls: { available_count: number; submitted_count: number; pending_count: number };
  controls_list: Array<{ id: string; name: string; deadline: string | null; cours: string; enonce: string; bareme: string; has_fichier_enonce: boolean }>;
  submitted_control_ids: string[];
  soumissions_detail: Array<{ soumission_id: string; controle_id: string; controle_name: string; statut: string; submitted_at: string; has_fichier: boolean; note: string | null; correction_publiee: string | null; correction_titre: string | null }>;
  notes: Array<{ controle: string; note: string; published_at: string | null }>;
  sujet_fin_stage: { titre: string; description: string; etat: string; encadrant: string; date_affectation: string } | null;
  notifications: { unread_count: number; latest: Array<{ id: string; title: string; message: string; type: string; created_at: string }> };
};

type CoordinateurDashboardData = {
  role: Role;
  monitoring: {
    brigades: Array<{
      brigade_code: string;
      classes_count: number;
      stagiaires_count: number;
      avec_notes_count: number;
      published_notes_count: number;
      note_moyenne: number | null;
      taux_reussite: number | null;
      soumissions_count: number;
    }>;
    controls_total: number;
    controls_published: number;
    notes_published: number;
    taux_reussite_global: number | null;
    avancement_moyen: number | null;
    stagiaires_total: number;
  };
  notifications: { unread_count: number };
};

type AdminDashboardData = {
  role: Role;
  platform: {
    users_total: number;
    users_active: number;
    cours_total: number;
    controles_total: number;
    soumissions_total: number;
  };
  users: Array<{
    id: number;
    username: string;
    email: string;
    is_active: boolean;
    role: string;
  }>;
};

type ClassementEntry = {
  rank: number | null;
  username: string;
  user_id: number;
  moyenne: number | null;
  evaluations_count: number;
  is_me?: boolean;
};
type ClassementClass = {
  classe_code: string;
  classe_label: string;
  my_rank?: number | null;
  my_moyenne?: number | null;
  total: number;
  leaderboard: ClassementEntry[];
};

type AdminClassementData = { classes: Omit<ClassementClass, "my_rank" | "my_moyenne">[] };

type SubjectData = { id: string; label: string };
type SubjectControlData = {
  id: string;
  name: string;
  status: string;
  cours_id: string;
  cours_title: string;
  instructeur_username: string;
  deadline: string | null;
};

type SubjectCourseData = {
  id: string;
  title: string;
  status: string;
  instructeur_username: string;
  date_depot: string;
};

type AdminClassData = {
  id: string;
  code: string;
  label: string;
  brigade: { code: string; label: string };
  instructeurs: Array<{ id: number; username: string }>;
  stageaires: Array<{ id: number; username: string }>;
};

type ReferenceCorp = { id: string; code: string; label: string };
type ReferenceRank = { id: string; code: string; label: string; corps_id: string };
type ReferenceSpeciality = { id: string; code: string; label: string; corps_id?: string | null };
type AdminEventData = {
  id: string;
  created_at: string;
  actor_username: string;
  actor_role: string;
  event_type: string;
  target_type: string;
  target_id: string;
  message: string;
  metadata: Record<string, unknown>;
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

/** Normalize a string for accent/case-insensitive matching */
const normStr = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/**
 * Obligatoire brochure names from the official programme table (image).
 * Each entry is a normalized fragment that must be contained in the brochure name.
 * Being explicit avoids false positives on similar names like "Système d'exploitation"
 * vs "Aperçu sur les Systèmes d'exploitation".
 */
const OBLIGATOIRE_FRAGMENTS: string[] = [
  // Bureautiques & Architectures
  "analyse des donnees avec excel",
  "structure et fonctionnement des ordinateurs",
  "apercu sur les systemes d exploitation",   // "Aperçu sur les Systèmes d'exploitation"
  // Algorithmique & Programmation
  "initiation a l algorithmique",             // "Initiation à l'Algorithmique"
  "langage de programmation c",
  "algorithmique, structures de donnees",     // "Algorithmique, Structures de données et programmation en"
  "algorithmique structures de donnees",
  // Bases de données & Modélisation
  "systeme d information et merise",          // "Système d'information et MERISE"
  "merise-exercices",                         // "MERISE-Exercices et corrigés"
  "merise exercices",
  "introduction aux bases de donnees",        // "Introduction aux bases de données et langage SQL"
  // Systèmes, Réseaux & SSI
  "initiation au systeme d exploitation unix",// "Initiation au système d'exploitation UNIX"
  "initiation aux reseaux",                   // "Initiation aux réseaux"
  "securite system en informatique",          // "Sécurité system en informatique"
  // Architectures & Développement Web
  "architectures web",                        // "Architectures Web"
  "developpement web avec html",              // "Développement web avec HTML et CSS"
];

/** Returns "obligatoire" if the brochure name contains one of the official mandatory fragments */
const getTag = (nom: string): "obligatoire" | "recommande" => {
  // Normalise: remove diacritics, lowercase, collapse apostrophes/hyphens to space
  const n = normStr(nom).trim().replace(/['\u2019-]/g, " ").replace(/\s+/g, " ");
  if (OBLIGATOIRE_FRAGMENTS.some((f) => n.includes(f))) return "obligatoire";
  return "recommande";
};

const TagBadge = ({ nom, className = "" }: { nom: string; className?: string }) => {
  const tag = getTag(nom);
  if (tag === "obligatoire") {
    return (
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${className}`} style={{ background: "#fee2e2", color: "#b91c1c" }}>
        Obligatoire
      </span>
    );
  }
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${className}`} style={{ background: "#dbeafe", color: "#1d4ed8" }}>
      Recommandé
    </span>
  );
};

// Keep old alias used on course cards
const CourseTagBadge = ({ titre }: { titre: string }) => <TagBadge nom={titre} />;
const ACCESS_TOKEN_KEY = "access_token";
const REFRESH_TOKEN_KEY = "refresh_token";
const ROLE_OPTIONS: Role[] = ["Instructeur", "Stagiaire", "Coordinateur"];

function Layout({
  user,
  onLogout,
  children,
}: {
  user: MeResponse | null;
  onLogout: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-app-soft text-app-dark">
      <header className="sticky top-0 z-20 border-b border-app-muted/60 bg-white/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3">
          <Link className="flex items-center gap-2.5 text-lg font-semibold tracking-tight text-app-dark" to="/">
            <img
              src="/logo.png"
              alt="Logo"
              className="h-10 w-10 rounded-full object-cover shadow-sm"
            />
            <span>{t("nav.brand")}</span>
          </Link>
          <nav className="flex items-center gap-2">
            <HeaderLink to="/">{t("nav.home")}</HeaderLink>
            {!user ? (
              <>
                <HeaderLink to="/login">{t("nav.login")}</HeaderLink>
                <HeaderLink to="/signup">{t("nav.signup")}</HeaderLink>
              </>
            ) : (
              <>
                <HeaderLink to="/dashboard">
                  {user.role === "Admin" ? t("workspace.Admin.title") : t("nav.dashboard")}
                </HeaderLink>
                <Button onClick={onLogout} size="small" sx={{ textTransform: "none", fontWeight: 600 }} variant="text">
                  {t("nav.logout")}
                </Button>
              </>
            )}
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}

function HeaderLink({ to, children }: { to: string; children: string }) {
  return (
    <Button component={NavLink} size="small" sx={{ textTransform: "none", fontWeight: 600 }} to={to} variant="text">
      {children}
    </Button>
  );
}

function PanelSection({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  return (
    <section className="card-hover rounded-2xl border border-app-muted bg-white p-6 shadow-sm">
      <h3 className="text-lg font-semibold">{title}</h3>
      {subtitle ? <p className="mt-1 text-sm text-app-dark/70">{subtitle}</p> : null}
      {children ? <div className="mt-3">{children}</div> : null}
    </section>
  );
}

function SubCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className="rounded-xl border border-app-muted bg-app-soft/40 p-4">
      <h4 className="text-sm font-semibold">{title}</h4>
      <div className="mt-3">{children}</div>
    </article>
  );
}

function MetricGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-3 md:grid-cols-2">{children}</div>;
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-app-muted/70 bg-app-soft px-3 py-2">
      <p className="text-xs uppercase tracking-[0.08em] text-app-dark/70">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}

const PLATFORM_COLORS = ["#6366f1", "#10b981", "#06b6d4", "#f59e0b", "#ec4899"];

function AdminPlatformChart({ platform }: { platform: { users_total: number; users_active: number; cours_total: number; controles_total: number; soumissions_total: number } }) {
  const stats = [
    { label: "Stagiaires", value: platform.users_total, color: "#6366f1", icon: <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /> },
    { label: "Cours", value: platform.cours_total, color: "#10b981", icon: <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /> },
    { label: "Contrôles", value: platform.controles_total, color: "#06b6d4", icon: <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /> },

  ];
  const data = stats.map((s) => ({ name: s.label, value: s.value }));
  return (
    <div className="mt-3 grid gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="flex items-center gap-3 rounded-xl border border-app-muted bg-app-soft/40 px-4 py-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: `${s.color}18` }}>
              <svg className="h-5 w-5" fill="none" stroke={s.color} strokeWidth={1.8} viewBox="0 0 24 24">{s.icon}</svg>
            </div>
            <div>
              <p className="text-xl font-bold text-app-dark leading-none">{s.value}</p>
              <p className="mt-0.5 text-xs text-app-dark/50">{s.label}</p>
            </div>
          </div>
        ))}
      </div>
      <div style={{ minWidth: 0 }}>
        <ResponsiveContainer width="100%" height={176}>
          <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }} cursor={{ fill: "#f1f5f9" }} />
            <Bar dataKey="value" name="Valeur" radius={[4, 4, 0, 0]} maxBarSize={56}>
              {data.map((_, i) => (
                <Cell key={i} fill={PLATFORM_COLORS[i % PLATFORM_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function AdminRoleChart({ users, onRoleClick }: { users: { role: string; is_active: boolean }[]; onRoleClick: (role: string) => void }) {
  const roles = ["Stagiaire", "Instructeur", "Coordinateur", "Admin"] as const;
  const data = roles.map((role) => ({
    name: role,
    Total: users.filter((u) => u.role === role).length,
    Actifs: users.filter((u) => u.role === role && u.is_active).length,
  }));
  return (
    <div className="mt-3" style={{ minWidth: 0 }}>
      <ResponsiveContainer width="100%" height={208}>
        <BarChart data={data} margin={{ top: 16, right: 8, left: -16, bottom: 0 }}
          onClick={(e) => { if (e?.activeLabel) onRoleClick(e.activeLabel); }}
          style={{ cursor: "pointer" }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip
            contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }}
            cursor={{ fill: "#f1f5f9" }}
          />
          <Legend wrapperStyle={{ fontSize: 12, paddingTop: 4 }} />
          <Bar dataKey="Total" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={32} />
          <Bar dataKey="Actifs" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={32} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button color={active ? "primary" : "inherit"} onClick={onClick} size="small" variant={active ? "contained" : "outlined"}>
      {children}
    </Button>
  );
}

function AdminNavButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button fullWidth onClick={onClick} size="small" sx={{ justifyContent: "flex-start", textTransform: "none" }} variant={active ? "contained" : "outlined"}>
      {children}
    </Button>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <Button onClick={onClick} size="small" sx={{ mb: 2 }} variant="outlined">
      Back
    </Button>
  );
}

function EmptyState({ message }: { message: string }) {
  return <Alert severity="info" sx={{ mt: 1 }}>{message}</Alert>;
}

type ReferenceManagementSectionProps = {
  referencesData: {
    corps: ReferenceCorp[];
    ranks: ReferenceRank[];
    specialities: ReferenceSpeciality[];
  };
  referenceTab: "corps" | "ranks" | "specialities";
  setReferenceTab: (value: "corps" | "ranks" | "specialities") => void;
  newCorps: { code: string; label: string };
  setNewCorps: React.Dispatch<React.SetStateAction<{ code: string; label: string }>>;
  newRank: { code: string; label: string; corps_id: string };
  setNewRank: React.Dispatch<React.SetStateAction<{ code: string; label: string; corps_id: string }>>;
  newSpeciality: { code: string; label: string; corps_id: string };
  setNewSpeciality: React.Dispatch<React.SetStateAction<{ code: string; label: string; corps_id: string }>>;
  handleCreateCorps: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  handleCreateRank: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  handleCreateSpeciality: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  handleRenameCorps: (corpsId: string, label: string, code: string) => void;
  handleRenameRank: (rankId: string, label: string, code: string, corpsId: string) => void;
  handleRenameSpeciality: (specialityId: string, label: string, code: string, corpsId: string) => void;
  handleDeleteCorps: (corpsId: string, label: string) => void;
  handleDeleteRank: (rankId: string, label: string) => void;
  handleDeleteSpeciality: (specialityId: string, label: string) => void;
};

function ReferenceManagementSection({
  referencesData,
  referenceTab,
  setReferenceTab,
  newCorps,
  setNewCorps,
  newRank,
  setNewRank,
  newSpeciality,
  setNewSpeciality,
  handleCreateCorps,
  handleCreateRank,
  handleCreateSpeciality,
  handleRenameCorps,
  handleRenameRank,
  handleRenameSpeciality,
  handleDeleteCorps,
  handleDeleteRank,
  handleDeleteSpeciality,
}: ReferenceManagementSectionProps) {
  return (
    <div className="grid gap-6">
      <PanelSection title="Corps, ranks et specialities">
        <p className="text-sm text-app-dark/70">
          Gérez les corps, grades et spécialités militaires. Ces données sont créées et administrées par l'administrateur.
        </p>
      </PanelSection>

      <div className="flex flex-wrap items-center gap-2">
        <TabButton active={referenceTab === "corps"} onClick={() => setReferenceTab("corps")}>
          Corps
        </TabButton>
        <TabButton active={referenceTab === "ranks"} onClick={() => setReferenceTab("ranks")}>
          Ranks
        </TabButton>
        <TabButton active={referenceTab === "specialities"} onClick={() => setReferenceTab("specialities")}>
          Specialities
        </TabButton>
      </div>

      {referenceTab === "corps" ? (
        <SubCard title="Corps">
          <form className="grid gap-2" onSubmit={handleCreateCorps}>
            <Input label="Code" value={newCorps.code} onChange={(value) => setNewCorps((prev) => ({ ...prev, code: value }))} />
            <Input label="Libelle" value={newCorps.label} onChange={(value) => setNewCorps((prev) => ({ ...prev, label: value }))} />
            <button className="rounded bg-app-dark px-3 py-2 text-xs font-semibold text-white" type="submit">
              Ajouter corp
            </button>
          </form>
          <div className="mt-3 space-y-2">
            {referencesData.corps.map((corp) => (
              <div key={corp.id} className="flex items-center justify-between rounded border border-app-muted px-2 py-1">
                <span className="text-xs">{corp.label} <span className="text-app-dark/50">({corp.code})</span></span>
                <div className="flex gap-1">
                  <button type="button" onClick={() => handleRenameCorps(corp.id, corp.label, corp.code)} className="rounded px-2 py-0.5 text-[11px] font-medium text-app-dark border border-app-muted hover:bg-app-soft">Éditer</button>
                  <button type="button" onClick={() => void handleDeleteCorps(corp.id, corp.label)} className="rounded px-2 py-0.5 text-[11px] font-medium text-red-600 border border-red-200 hover:bg-red-50">Supprimer</button>
                </div>
              </div>
            ))}
            {referencesData.corps.length === 0 ? <EmptyState message="Aucun corp." /> : null}
          </div>
        </SubCard>
      ) : null}

      {referenceTab === "ranks" ? (
        <SubCard title="Ranks">
          <form className="grid gap-2" onSubmit={handleCreateRank}>
            <Input label="Code" value={newRank.code} onChange={(value) => setNewRank((prev) => ({ ...prev, code: value }))} />
            <Input label="Libelle" value={newRank.label} onChange={(value) => setNewRank((prev) => ({ ...prev, label: value }))} />
            <label className="grid gap-1 text-sm font-medium text-app-dark">
              Corp
              <select
                className="rounded border border-app-muted bg-white px-3 py-2"
                onChange={(event) => setNewRank((prev) => ({ ...prev, corps_id: event.target.value }))}
                value={newRank.corps_id}
              >
                <option value="">Selectionner</option>
                {referencesData.corps.map((corp) => (
                  <option key={corp.id} value={corp.id}>
                    {corp.label}
                  </option>
                ))}
              </select>
            </label>
            <button className="rounded bg-app-dark px-3 py-2 text-xs font-semibold text-white" type="submit">
              Ajouter rank
            </button>
          </form>
          <div className="mt-3 space-y-2">
            {referencesData.ranks.map((rank) => (
              <div key={rank.id} className="flex items-center justify-between rounded border border-app-muted px-2 py-1">
                <span className="text-xs">{rank.label} <span className="text-app-dark/50">({rank.code})</span></span>
                <div className="flex gap-1">
                  <button type="button" onClick={() => handleRenameRank(rank.id, rank.label, rank.code, rank.corps_id)} className="rounded px-2 py-0.5 text-[11px] font-medium text-app-dark border border-app-muted hover:bg-app-soft">Éditer</button>
                  <button type="button" onClick={() => void handleDeleteRank(rank.id, rank.label)} className="rounded px-2 py-0.5 text-[11px] font-medium text-red-600 border border-red-200 hover:bg-red-50">Supprimer</button>
                </div>
              </div>
            ))}
            {referencesData.ranks.length === 0 ? <EmptyState message="Aucun rank." /> : null}
          </div>
        </SubCard>
      ) : null}

      {referenceTab === "specialities" ? (
        <SubCard title="Specialities">
          <form className="grid gap-2" onSubmit={handleCreateSpeciality}>
            <Input label="Code" value={newSpeciality.code} onChange={(value) => setNewSpeciality((prev) => ({ ...prev, code: value }))} />
            <Input label="Libelle" value={newSpeciality.label} onChange={(value) => setNewSpeciality((prev) => ({ ...prev, label: value }))} />
            <label className="grid gap-1 text-sm font-medium text-app-dark">
              Corp (optionnel)
              <select
                className="rounded border border-app-muted bg-white px-3 py-2"
                onChange={(event) => setNewSpeciality((prev) => ({ ...prev, corps_id: event.target.value }))}
                value={newSpeciality.corps_id}
              >
                <option value="">Selectionner</option>
                {referencesData.corps.map((corp) => (
                  <option key={corp.id} value={corp.id}>
                    {corp.label}
                  </option>
                ))}
              </select>
            </label>
            <button className="rounded bg-app-dark px-3 py-2 text-xs font-semibold text-white" type="submit">
              Ajouter speciality
            </button>
          </form>
          <div className="mt-3 space-y-2">
            {referencesData.specialities.map((speciality) => (
              <div key={speciality.id} className="flex items-center justify-between rounded border border-app-muted px-2 py-1">
                <span className="text-xs">
                  {speciality.label} <span className="text-app-dark/50">({speciality.code})</span>
                  {speciality.corps_id ? <span className="ml-1 text-app-dark/40">â€” {referencesData.corps.find((c) => c.id === speciality.corps_id)?.label ?? ""}</span> : null}
                </span>
                <div className="flex gap-1">
                  <button type="button" onClick={() => handleRenameSpeciality(speciality.id, speciality.label, speciality.code, speciality.corps_id ?? "")} className="rounded px-2 py-0.5 text-[11px] font-medium text-app-dark border border-app-muted hover:bg-app-soft">Éditer</button>
                  <button type="button" onClick={() => void handleDeleteSpeciality(speciality.id, speciality.label)} className="rounded px-2 py-0.5 text-[11px] font-medium text-red-600 border border-red-200 hover:bg-red-50">Supprimer</button>
                </div>
              </div>
            ))}
            {referencesData.specialities.length === 0 ? <EmptyState message="Aucune speciality." /> : null}
          </div>
        </SubCard>
      ) : null}
    </div>
  );
}

function HomePage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 grid gap-6">

      {/* â”€â”€ Hero banner â”€â”€ */}
      <div
        className="relative overflow-hidden rounded-2xl shadow-xl"
        style={{ background: "linear-gradient(135deg, #0E0F29 0%, #15173D 60%, #1E1F4A 100%)" }}
      >
        {/* Decorative blobs */}
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full opacity-10" style={{ background: "#982598" }} />
        <div className="pointer-events-none absolute -bottom-10 right-32 h-40 w-40 rounded-full opacity-10" style={{ background: "#982598" }} />
        <div className="pointer-events-none absolute bottom-6 right-6 h-20 w-20 rounded-full opacity-10" style={{ background: "#982598" }} />

        <div className="relative flex flex-col gap-10 p-10 md:flex-row md:items-center md:justify-between">

          {/* Left â€” text */}
          <div className="max-w-xl">
            <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "#982598" }}>
              Enterprise Training Platform
            </p>
            <h1 className="mt-3 text-4xl font-black uppercase leading-tight text-white md:text-5xl">
              <span style={{ color: "#982598" }}>Plateforme de cours par correspondance</span>
            </h1>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                className="rounded-xl px-6 py-3 text-sm font-bold text-white shadow-lg transition hover:opacity-90"
                style={{ background: "#982598" }}
                to="/login"
              >
                Se connecter â†’
              </Link>
              <Link
                className="rounded-xl border px-6 py-3 text-sm font-bold text-white/80 transition hover:bg-white/10"
                style={{ borderColor: "rgba(152,37,152,0.4)" }}
                to="/signup"
              >
                Créer un compte
              </Link>
            </div>
          </div>

          {/* Right â€” illustration */}
          <div className="flex shrink-0 flex-col items-center gap-4">
            {/* Fake monitor */}
            <div
              className="flex h-40 w-56 flex-col rounded-2xl border-4 shadow-2xl"
              style={{ background: "rgba(255,255,255,0.05)", borderColor: "rgba(152,37,152,0.3)" }}
            >
              <div className="flex flex-1 flex-col justify-center gap-2 p-4">
                <div className="h-2.5 w-full rounded-full bg-white/40" />
                <div className="h-2.5 w-4/5 rounded-full bg-white/25" />
                <div className="h-2.5 w-3/5 rounded-full bg-white/25" />
                <div className="mt-3 flex items-center gap-2">
                  <div
                    className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white"
                    style={{ background: "#982598" }}
                  >âœ“</div>
                  <div className="h-2.5 flex-1 rounded-full bg-white/20" />
                </div>
              </div>
              <div className="flex justify-center pb-2">
                <div className="h-3 w-10 rounded-b bg-white/10" />
              </div>
            </div>
            <div className="h-2 w-20 rounded-full bg-white/10" />

            {/* Role pills */}
            <div className="flex flex-wrap justify-center gap-2 mt-1">
              {["Admin", "Instructeur", "Stagiaire", "Coordinateur"].map((r) => (
                <span
                  key={r}
                  className="rounded-full px-3 py-1 text-xs font-semibold text-white/80"
                  style={{ background: "rgba(152,37,152,0.18)" }}
                >
                  {r}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* â”€â”€ Feature cards â”€â”€ */}
      <div className="grid gap-4 md:grid-cols-3">
        {[
          {
            icon: <svg className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>,
            title: "Cours structurés",
            desc: "Modules, matières, brochures et leçons organisés hiérarchiquement.",
          },
          {
            icon: <svg className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>,
            title: "Contrôles & Corrections",
            desc: "Publiez des examens, recevez les soumissions et notez en ligne.",
          },
          {
            icon: <svg className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>,
            title: "Suivi de progression",
            desc: "Tableaux de bord par rôle pour un suivi en temps réel.",
          },
        ].map((f) => (
          <div key={f.title} className="rounded-2xl border border-app-muted bg-white p-6 shadow-sm">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl text-app-accent" style={{ background: "rgba(21,23,61,0.07)" }}>
              {f.icon}
            </div>
            <h3 className="mt-3 text-base font-bold text-app-dark">{f.title}</h3>
            <p className="mt-1 text-sm text-app-dark/60 leading-relaxed">{f.desc}</p>
          </div>
        ))}
      </div>

    </main>
  );
}

function LoginPage({
  onLogin,
  error,
}: {
  onLogin: (username: string, password: string) => Promise<void>;
  error: string | null;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    try {
      await onLogin(username, password);
      navigate("/dashboard");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto grid w-full max-w-md gap-5 px-4 py-10">
      <section className="card-hover rounded-2xl border border-app-muted bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight text-app-dark">{t("login.title")}</h1>
        <p className="mt-1 text-sm text-app-dark/70">{t("login.subtitle")}</p>
        <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
          <Input label={t("labels.username")} value={username} onChange={setUsername} />
          <Input label={t("labels.password")} type="password" value={password} onChange={setPassword} />
          <button
            className="w-full rounded-md bg-app-dark px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            disabled={busy}
            type="submit"
          >
            {busy ? t("login.loading") : t("login.submit")}
          </button>
        </form>
        {error ? <p className="mt-4 rounded-md bg-app-accent/15 px-3 py-2 text-sm text-app-dark">{error}</p> : null}
      </section>
    </main>
  );
}

function SignupPage({
  onSignup,
  error,
  references,
}: {
  onSignup: (payload: {
    username: string;
    password: string;
    email: string;
    role: Role;
    matricule: string;
    est_civil: boolean;
    corps_id: string;
  }) => Promise<void>;
  error: string | null;
  references: { corps: ReferenceCorp[] };
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("Stagiaire");
  const [matricule, setMatricule] = useState("");
  const [estCivil, setEstCivil] = useState(false);
  const [corpsId, setCorpsId] = useState("");
  const [busy, setBusy] = useState(false);
  const requiresMilitaryProfile = !(role === "Instructeur" && estCivil);
  const matriculeRequired = requiresMilitaryProfile;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (matriculeRequired && !matricule.trim()) {
      return;
    }
    if (requiresMilitaryProfile && !corpsId) {
      return;
    }
    setBusy(true);
    try {
      await onSignup({
        username,
        password,
        email,
        role,
        matricule: matricule.trim(),
        est_civil: role === "Instructeur" ? estCivil : false,
        corps_id: requiresMilitaryProfile ? corpsId : "",
      });
      navigate("/dashboard");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto grid w-full max-w-md gap-5 px-4 py-10">
      <section className="card-hover rounded-2xl border border-app-muted bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight text-app-dark">{t("signup.title")}</h1>
        <p className="mt-1 text-sm text-app-dark/70">{t("signup.subtitle")}</p>
        <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
          <Input label={t("labels.username")} value={username} onChange={setUsername} />
          <Input label={t("labels.email")} value={email} onChange={setEmail} />
          <Input label={t("labels.password")} type="password" value={password} onChange={setPassword} />
          <Input
            label={matriculeRequired ? t("labels.matriculeRequired") : t("labels.matriculeOptional")}
            value={matricule}
            onChange={setMatricule}
            required={matriculeRequired}
          />
          <label className="grid gap-1 text-sm font-medium text-app-dark">
            {t("signup.profile")}
            <select
              className="rounded-md border border-app-muted bg-white px-3 py-2 outline-none focus:border-app-accent"
              value={role}
              onChange={(event) => {
                const nextRole = event.target.value as Role;
                setRole(nextRole);
                if (nextRole !== "Instructeur") {
                  setEstCivil(false);
                }
              }}
            >
              {ROLE_OPTIONS.map((entry) => (
                <option key={entry} value={entry}>
                  {t(`roles.${entry}`)}
                </option>
              ))}
            </select>
          </label>
          {role === "Instructeur" ? (
            <label className="flex items-center gap-2 text-sm font-medium text-app-dark">
              <input checked={estCivil} onChange={(event) => setEstCivil(event.target.checked)} type="checkbox" />
              Instructeur civil
            </label>
          ) : null}
          {requiresMilitaryProfile ? (
            <label className="grid gap-1 text-sm font-medium text-app-dark">
              Corps
              <select
                className="rounded-md border border-app-muted bg-white px-3 py-2 outline-none focus:border-app-accent"
                onChange={(event) => setCorpsId(event.target.value)}
                required
                value={corpsId}
              >
                <option value="">Sélectionner</option>
                {references.corps.map((corp) => (
                  <option key={corp.id} value={corp.id}>
                    {corp.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <button
            className="w-full rounded-md bg-app-dark px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            disabled={busy}
            type="submit"
          >
            {busy ? t("signup.loading") : t("signup.submit")}
          </button>
        </form>
        {error ? <p className="mt-4 rounded-md bg-app-accent/15 px-3 py-2 text-sm text-app-dark">{error}</p> : null}
      </section>
    </main>
  );
}

function DashboardPage({
  user,
  onLoadProfile,
  apiFetch,
  onSessionInvalid,
}: {
  user: MeResponse | null;
  onLoadProfile: () => Promise<void>;
  apiFetch: (path: string, init?: RequestInit) => Promise<Response>;
  onSessionInvalid: () => void;
}) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [instructeurData, setInstructeurData] = useState<InstructeurDashboardData | null>(null);
  const [stageaireData, setStageaireData] = useState<StageaireDashboardData | null>(null);
  const [selectedCours, setSelectedCours] = useState<{
    id: string; titre: string; matiere: string; description: string; instructeur: string; date_depot: string;
    fichiers: Array<{ id_cours_fichier: string; nom_fichier: string; mime_type: string; taille_octets: number }>;
    controles: Array<{ id: string; nom: string; enonce: string; bareme: number; date_limite: string | null; has_fichier: boolean; nom_fichier_enonce: string }>;
  } | null>(null);
  const [coursFileCache, setCoursFileCache] = useState<Record<string, { base64: string; name: string; mimeType: string }>>({});
  const [selectedModule, setSelectedModule] = useState<{ id: string; nom: string; matieres: Array<{ id: string; nom: string; cours_count: number }> } | null>(null);
  const [selectedMatiere, setSelectedMatiere] = useState<{ id: string; nom: string; module_nom: string; brochures: Array<{ id: string; nom: string; cours_count: number }>; cours: Array<{ id: string; titre: string; description: string; instructeur: string; controles_count: number }> } | null>(null);
  const [selectedBrochure, setSelectedBrochure] = useState<{ id: string; nom: string; matiere_nom: string; module_nom: string; cours: Array<{ id: string; titre: string; description: string; instructeur: string; controles_count: number }> } | null>(null);
  const [modulesExpanded, setModulesExpanded] = useState(false);
  const [coordinateurData, setCoordinateurData] = useState<CoordinateurDashboardData | null>(null);
  const [adminData, setAdminData] = useState<AdminDashboardData | null>(null);

  const [modulesList, setModulesList] = useState<Array<{ id: string; nom: string; matieres: Array<{ id: string; nom: string }> }>>([]);
  const [courseTitle, setCourseTitle] = useState("");
  const [courseDescription, setCourseDescription] = useState("");
  const [courseModuleId, setCourseModuleId] = useState("");
  const [courseMatiereId, setCourseMatiereId] = useState("");
  const [courseClasseId, setCourseClasseId] = useState("");
  const [courseFichierFile, setCourseFichierFile] = useState<File | null>(null);
  const [controlCoursId, setControlCoursId] = useState("");
  const [controlName, setControlName] = useState("");
  const [controlPrompt, setControlPrompt] = useState("");
  const [controlEnonceFichier, setControlEnonceFichier] = useState<File | null>(null);
  const [detailControleId, setDetailControleId] = useState<string | null>(null);
  const [detailControlePdf, setDetailControlePdf] = useState<{ base64: string; name: string; mimeType: string } | null>(null);
  const [detailControlePdfLoading, setDetailControlePdfLoading] = useState(false);
  const [correctionFichier, setCorrectionFichier] = useState<Record<string, { base64: string; name: string; mimeType: string } | null>>({});
  const [correctionFichierLoading, setCorrectionFichierLoading] = useState<Record<string, boolean>>({});
  const submissionAnswers: Record<string, string> = {};
  const [submissionFiles, setSubmissionFiles] = useState<Record<string, File>>({});
  const [evalNote, setEvalNote] = useState<Record<string, string>>({});
  const [evalCorrection, setEvalCorrection] = useState<Record<string, string>>({});
  const [correctionText, setCorrectionText] = useState<Record<string, string>>({});
  const [correctionPdf, setCorrectionPdf] = useState<Record<string, File | null>>({});
  type InstallFichier = { id: string; titre: string; nom_fichier: string; uploaded_at: string };
  const [installFichiers, setInstallFichiers] = useState<InstallFichier[]>([]);
  const [installUploadFile, setInstallUploadFile] = useState<File | null>(null);
  const [installUploadTitre, setInstallUploadTitre] = useState("");
  const [installUploading, setInstallUploading] = useState(false);
  const [feuilleRFichiers, setFeuilleRFichiers] = useState<InstallFichier[]>([]);
  const [feuilleRUploadFile, setFeuilleRUploadFile] = useState<File | null>(null);
  const [feuilleRUploadTitre, setFeuilleRUploadTitre] = useState("");
  const [feuilleRUploading, setFeuilleRUploading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [pdfViewer, setPdfViewer] = useState<{ base64: string; name: string; mimeType: string } | null>(null);
  const [lessonModal, setLessonModal] = useState<{
    cours: { id: string; titre: string; matiere: string; description: string; instructeur: string; date_depot: string; fichiers: Array<{ id_cours_fichier: string; nom_fichier: string; mime_type: string; taille_octets: number }> };
    files: Record<string, { base64: string; name: string; mimeType: string }>;
  } | null>(null);
  const [lessonModalLoading, setLessonModalLoading] = useState(false);
  const [instructeurView, setInstructeurView] = useState<"dashboard" | "cours" | "controles" | "corriger" | "sujet" | "installation_logiciels">("dashboard");
  const [stageaireView, setStageaireView] = useState<"dashboard" | "cours" | "controles" | "sujet" | "classement" | "installation_logiciels" | "feuille_redaction">("dashboard");
  const [coordinateurView, setCoordinateurView] = useState<"dashboard" | "reporting" | "export">("dashboard");
  const [coordNotifDismissed, setCoordNotifDismissed] = useState(false);
  const [brigadeSearch, setBrigadeSearch] = useState("");
  const [brigadeFilter, setBrigadeFilter] = useState<"tous" | "reussite" | "surveiller" | "sans_notes">("tous");
  const [adminView, setAdminView] = useState<"overview" | "users" | "accounts" | "bulk_csv" | "subjects" | "classes" | "references" | "events" | "classement" | "fichiers_renseignement" | "modules" | "feuille_redaction">("overview");
  const [selectedAdminUser, setSelectedAdminUser] = useState<AdminDashboardData["users"][number] | null>(null);
  const [subjects, setSubjects] = useState<SubjectData[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>("");
  const [subjectControls, setSubjectControls] = useState<SubjectControlData[]>([]);
  const [subjectCourses, setSubjectCourses] = useState<SubjectCourseData[]>([]);
  const [subjectTab, setSubjectTab] = useState<"subjects" | "controls" | "courses">("subjects");
  const [adminModules, setAdminModules] = useState<Array<{ id: string; nom: string; matieres: Array<{ id: string; nom: string; cours_count: number }> }>>([]);
  const [adminSelectedModule, setAdminSelectedModule] = useState<{ id: string; nom: string; matieres: Array<{ id: string; nom: string; cours_count: number }> } | null>(null);
  const [adminSelectedMatiere, setAdminSelectedMatiere] = useState<{ id: string; nom: string; module_nom: string; brochures: Array<{ id: string; nom: string; cours_count: number }>; cours: Array<{ id: string; titre: string; description: string; instructeur: string; controles_count: number }> } | null>(null);
  const [adminSelectedBrochure, setAdminSelectedBrochure] = useState<{ id: string; nom: string; matiere_nom: string; module_nom: string; cours: Array<{ id: string; titre: string; description: string; instructeur: string; controles_count: number }> } | null>(null);
  const [adminModulesLoading, setAdminModulesLoading] = useState(false);
  const [newSubjectLabel, setNewSubjectLabel] = useState("");
  const [adminUserSearch, setAdminUserSearch] = useState("");
  const [adminUsersExpanded, setAdminUsersExpanded] = useState(false);
  const [adminUserRoleFilter, setAdminUserRoleFilter] = useState<string | null>(null);
  const [adminStatusFilter, setAdminStatusFilter] = useState<"tous" | "actif" | "inactif">("tous");
  const [adminUserSort, setAdminUserSort] = useState<"az" | "za" | "recent">("az");
  const [adminUsersPage, setAdminUsersPage] = useState(1);
  const ADMIN_USERS_PER_PAGE = 10;
  const [instructeurCoursSearch, setInstructeurCoursSearch] = useState("");
  const [adminCoursSearch, setAdminCoursSearch] = useState("");
  const [adminControlSearch, setAdminControlSearch] = useState("");
  const [accountForm, setAccountForm] = useState({
    username: "",
    email: "",
    password: "",
    role: "Stagiaire",
    matricule: "",
    est_civil: false,
    corps_id: "",
    rank_id: "",
    speciality_id: "",
  });
  const [lastCreatedAccount, setLastCreatedAccount] = useState<{ username: string; password: string; role: string; matricule: string } | null>(null);
  const [showAccountPassword, setShowAccountPassword] = useState(false);
  const [resetPasswordState, setResetPasswordState] = useState<Record<number, { value: string; show: boolean; saved: string }>>({});
  const [emailResetState, setEmailResetState] = useState<Record<number, "idle" | "loading" | "sent" | "no_email" | "error">>({});

  const [adminClassementData, setAdminClassementData] = useState<AdminClassementData | null>(null);
  const [adminFichiersRenseignement, setAdminFichiersRenseignement] = useState<Array<{ stagiaire_id: number; stagiaire_username: string; sujet_titre: string; nom_fichier: string; etat: string; has_fichier: boolean }> | null>(null);
  const [adminFichierTemplate, setAdminFichierTemplate] = useState<{ has_template: boolean; nom_fichier: string } | null>(null);
  const [adminPreviewFichier, setAdminPreviewFichier] = useState<{ base64: string; nom_fichier: string; mime_type: string } | null>(null);
  const [adminFichierTemplateFile, setAdminFichierTemplateFile] = useState<File | null>(null);
  const [stagiaireFichierStatus, setStagiaireFichierStatus] = useState<{ has_fichier: boolean; nom_fichier: string } | null>(null);
  const [stagiaireFichierUploadFile, setStagiaireFichierUploadFile] = useState<File | null>(null);
  const [stagiaireFichierUploading, setStagiaireFichierUploading] = useState(false);
  const [csvFileName, setCsvFileName] = useState("");
  const [csvErrors, setCsvErrors] = useState<Array<{ line: number; error: string }>>([]);
  const [classesData, setClassesData] = useState<AdminClassData[]>([]);
  const [newClassForm, setNewClassForm] = useState({ libelle: "" });
  const [selectedClassId, setSelectedClassId] = useState("");
  const [selectedStageaireIds, setSelectedStageaireIds] = useState<number[]>([]);
  const [selectedInstructeurIds, setSelectedInstructeurIds] = useState<number[]>([]);
  const [stagSearch, setStagSearch] = useState("");
  const [instrSearch, setInstrSearch] = useState("");
  const [referencesData, setReferencesData] = useState<{
    corps: ReferenceCorp[];
    ranks: ReferenceRank[];
    specialities: ReferenceSpeciality[];
  }>({ corps: [], ranks: [], specialities: [] });
  const [referenceTab, setReferenceTab] = useState<"corps" | "ranks" | "specialities">("corps");
  const [newCorps, setNewCorps] = useState({ code: "", label: "" });
  const [newRank, setNewRank] = useState({ code: "", label: "", corps_id: "" });
  const [newSpeciality, setNewSpeciality] = useState({ code: "", label: "", corps_id: "" });
  const [adminEvents, setAdminEvents] = useState<AdminEventData[]>([]);
  const [toastState, setToastState] = useState<{ kind: "success" | "error"; message: string; closing: boolean } | null>(null);
  const [renameModal, setRenameModal] = useState<{
    open: boolean;
    target: "corps" | "rank" | "speciality" | null;
    id: string;
    value: string;
    code: string;
    corps_id: string;
  }>({ open: false, target: null, id: "", value: "", code: "", corps_id: "" });

  useEffect(() => {
    void onLoadProfile();
  }, [onLoadProfile]);

  useEffect(() => {
    if (!lessonModal && !lessonModalLoading) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setLessonModal(null); setLessonModalLoading(false); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [lessonModal, lessonModalLoading]);

  useEffect(() => {
    if (!user) return;
    if (user.role === "Admin") {
      let suffix = t("titles.adminOverview");
      if (adminView === "users") suffix = selectedAdminUser ? t("titles.adminUserDetails") : t("titles.adminUsers");
      if (adminView === "accounts") suffix = t("titles.adminAccounts");
      if (adminView === "subjects") {
        suffix =
          subjectTab === "controls"
            ? t("titles.adminSubjectsControls")
            : subjectTab === "courses"
              ? t("titles.adminSubjectsCourses")
              : t("titles.adminSubjects");
      }
      if (adminView === "classes") suffix = t("titles.adminClasses");
      if (adminView === "references") {
        suffix = referenceTab === "corps" ? "References - Corps" : referenceTab === "ranks" ? "References - Ranks" : "References - Specialities";
      }
      if (adminView === "events") suffix = "Events";
      document.title = `${t("titles.adminWorkspace")} - ${suffix}`;
      return;
    }
    if (user.role === "Instructeur") document.title = `${t("titles.instructorDashboard")} - ${t("titles.appName")}`;
    if (user.role === "Stagiaire") document.title = `${t("titles.traineeDashboard")} - ${t("titles.appName")}`;
    if (user.role === "Coordinateur") document.title = `${t("titles.coordinatorDashboard")} - ${t("titles.appName")}`;
  }, [user, adminView, selectedAdminUser, subjectTab, referenceTab, t]);

  const loadDashboard = async () => {
    if (!user) return;
    setLoading(true);
    setDashboardError(null);
    if (user.role !== "Admin") {
      setSelectedAdminUser(null);
      setAdminView("overview");
    }
    try {
      if (user.role === "Instructeur") {
        const [response, modResp] = await Promise.all([
          apiFetch("/api/dashboard/instructeur/"),
          apiFetch("/api/modules/"),
        ]);
        if (response.status === 403) { onSessionInvalid(); return; }
        if (!response.ok) throw new Error("failed");
        const data: InstructeurDashboardData = await response.json();
        setInstructeurData(data);
        if (modResp.ok) { const mods = await modResp.json(); setModulesList(mods); }
      } else if (user.role === "Stagiaire") {
        const [response, allModsResp] = await Promise.all([
          apiFetch("/api/dashboard/stageaire/"),
          apiFetch("/api/modules/"),
        ]);
        if (response.status === 403) { onSessionInvalid(); return; }
        if (!response.ok) throw new Error("failed");
        const data: StageaireDashboardData = await response.json();
        if (data.modules_list.length === 0 && allModsResp.ok) {
          const allMods: Array<{ id: string; nom: string; matieres: Array<{ id: string; nom: string }> }> = await allModsResp.json();
          data.modules_list = allMods.map((m) => ({ ...m, matieres: m.matieres.map((mat) => ({ ...mat, cours_count: 0 })) }));
        }
        setStageaireData(data);
        void loadStagiaireFichierStatus();
      } else if (user.role === "Coordinateur") {
        const response = await apiFetch("/api/dashboard/coordinateur/");
        if (response.status === 403) { onSessionInvalid(); return; }
        if (!response.ok) throw new Error("failed");
        const data: CoordinateurDashboardData = await response.json();
        setCoordinateurData(data);
      } else if (user.role === "Admin") {
        const response = await apiFetch("/api/dashboard/admin/");
        if (response.status === 403) { onSessionInvalid(); return; }
        if (!response.ok) throw new Error("failed");
        const data: AdminDashboardData = await response.json();
        setAdminData(data);
      }
    } catch {
      setDashboardError(t("errors.profileLoadFailed"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    void loadDashboard();
  }, [user?.role]);

  // Silently refresh admin data (no full-page spinner) when the admin navigates
  // to a view that lists users â€” ensures they see accounts created by others.
  const [adminRefreshing, setAdminRefreshing] = useState(false);
  const reloadAdminData = async () => {
    if (!user || user.role !== "Admin") return;
    setAdminRefreshing(true);
    try {
      const response = await apiFetch("/api/dashboard/admin/");
      if (response.ok) {
        const data: AdminDashboardData = await response.json();
        setAdminData(data);
      }
    } finally {
      setAdminRefreshing(false);
    }
  };

  useEffect(() => {
    if (!user || user.role !== "Admin") return;
    if (adminView === "users" || adminView === "accounts" || adminView === "bulk_csv" || adminView === "classes") {
      void reloadAdminData();
    }
    if (adminView === "classement") {
      void loadAdminClassement();
    }
    if (adminView === "fichiers_renseignement") {
      void loadAdminFichiersRenseignement();
      void loadAdminFichierTemplate();
    }
    if (adminView === "modules") {
      setAdminModulesLoading(true);
      apiFetch("/api/modules/").then(async (r) => {
        if (r.ok) { const d = await r.json(); setAdminModules(d); }
        setAdminModulesLoading(false);
      });
    }
  }, [adminView]);


  const loadAdminClassement = async () => {
    const r = await apiFetch("/api/admin/classement/");
    if (r.ok) { const d: AdminClassementData = await r.json(); setAdminClassementData(d); }
  };

  const loadAdminFichiersRenseignement = async () => {
    const r = await apiFetch("/api/admin/fichiers-renseignement/");
    if (r.ok) { const d = await r.json(); setAdminFichiersRenseignement(d); }
  };

  const handleAdminDownloadFichierRenseignement = async (stagiaireId: number, nomFichier: string) => {
    const r = await apiFetch(`/api/admin/fichiers-renseignement/?stagiaire_id=${stagiaireId}`);
    if (!r.ok) return;
    const data: { fichier_base64: string; nom_fichier: string; mime_type: string } = await r.json();
    triggerDownload(data.fichier_base64, nomFichier || "fichier-renseignement", data.mime_type);
  };

  const handleAdminPreviewFichierRenseignement = async (stagiaireId: number) => {
    const r = await apiFetch(`/api/admin/fichiers-renseignement/?stagiaire_id=${stagiaireId}`);
    if (!r.ok) return;
    const data: { fichier_base64: string; nom_fichier: string; mime_type: string } = await r.json();
    setAdminPreviewFichier({ base64: data.fichier_base64, nom_fichier: data.nom_fichier, mime_type: data.mime_type });
  };

  const loadAdminFichierTemplate = async () => {
    const r = await apiFetch("/api/admin/fichier-template/");
    if (r.ok) { const d: { has_template: boolean; nom_fichier: string } = await r.json(); setAdminFichierTemplate(d); }
  };

  const handleAdminUploadFichierTemplate = async () => {
    if (!adminFichierTemplateFile) return;
    const fichier_base64 = await readFileAsBase64(adminFichierTemplateFile);
    const r = await apiFetch("/api/admin/fichier-template/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fichier_base64, nom_fichier: adminFichierTemplateFile.name, mime_type: adminFichierTemplateFile.type || "application/octet-stream" }),
    });
    if (r.ok) { setAdminFichierTemplateFile(null); void loadAdminFichierTemplate(); }
  };

  const handleAdminDownloadFichierTemplate = async () => {
    const r = await apiFetch("/api/admin/fichier-template/?download=1");
    if (!r.ok) return;
    const data: { fichier_base64: string; nom_fichier: string; mime_type: string } = await r.json();
    triggerDownload(data.fichier_base64, data.nom_fichier || "fichier-renseignement-modele", data.mime_type);
  };

  const loadStagiaireFichierStatus = async () => {
    const r = await apiFetch("/api/stageaire/fichier-renseignement/?status=1");
    if (r.ok) { const d: { has_fichier: boolean; nom_fichier: string } = await r.json(); setStagiaireFichierStatus(d); }
    else { setStagiaireFichierStatus({ has_fichier: false, nom_fichier: "" }); }
  };

  const handleStageaireDownloadTemplate = async () => {
    const r = await apiFetch("/api/stageaire/fichier-template/");
    if (!r.ok) return;
    const data: { fichier_base64: string; nom_fichier: string; mime_type: string } = await r.json();
    triggerDownload(data.fichier_base64, data.nom_fichier || "fichier-renseignement", data.mime_type);
  };

  const handleStageaireUploadFichierRenseignement = async () => {
    if (!stagiaireFichierUploadFile) return;
    setStagiaireFichierUploading(true);
    const fichier_base64 = await readFileAsBase64(stagiaireFichierUploadFile);
    const r = await apiFetch("/api/stageaire/fichier-renseignement/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fichier_base64, nom_fichier: stagiaireFichierUploadFile.name, mime_type: stagiaireFichierUploadFile.type || "application/octet-stream" }),
    });
    setStagiaireFichierUploading(false);
    if (r.ok) { setStagiaireFichierUploadFile(null); void loadStagiaireFichierStatus(); }
  };

  const handleCreateCourse = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const response = await apiFetch("/api/instructeur/cours/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ titre: courseTitle, description: courseDescription, module_id: courseModuleId || undefined, matiere_id: courseMatiereId || undefined, classe_id: courseClasseId || undefined, publier: true }),
    });
    if (!response.ok) return;
    const created: { id: string } = await response.json();
    if (courseFichierFile) {
      const fichier_base64 = await readFileAsBase64(courseFichierFile);
      await apiFetch(`/api/instructeur/cours/${created.id}/fichier/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fichier_base64, nom_fichier: courseFichierFile.name, mime_type: courseFichierFile.type || "application/rtf" }),
      });
    }
    const withFile = courseFichierFile ? ` + fichier « ${courseFichierFile.name} »` : "";
    setCourseTitle("");
    setCourseDescription("");
    setCourseClasseId("");
    setCourseFichierFile(null);
    setActionMessage(`Cours « ${courseTitle} » publié${withFile}.`);
    await loadDashboard();
  };

  const handleCreateControl = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const response = await apiFetch("/api/instructeur/controles/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cours_id: controlCoursId,
        nom: controlName,
        enonce: controlPrompt,
        publier: true,
      }),
    });
    if (!response.ok) return;
    const created: { id: string } = await response.json();
    if (controlEnonceFichier) {
      const fichier_base64 = await readFileAsBase64(controlEnonceFichier);
      await apiFetch(`/api/instructeur/controles/${created.id}/fichier/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fichier_base64, nom_fichier: controlEnonceFichier.name, mime_type: controlEnonceFichier.type || "application/rtf" }),
      });
    }
    const coursName = instructeurData?.cours_list.find((c) => c.id === controlCoursId)?.title ?? controlCoursId;
    const withEnonce = controlEnonceFichier ? ` + énoncé « ${controlEnonceFichier.name} »` : "";
    setControlName("");
    setControlPrompt("");
    setControlEnonceFichier(null);
    setActionMessage(`Contrôle « ${controlName} » publié pour le cours « ${coursName} »${withEnonce}.`);
    await loadDashboard();
  };

  const handleEvaluate = async (soumissionId: string) => {
    const note = evalNote[soumissionId];
    const correction = evalCorrection[soumissionId] ?? "";
    const response = await apiFetch(`/api/instructeur/soumissions/${soumissionId}/evaluate/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note, correction, publier_note: true }),
    });
    if (response.ok) {
      const sub = instructeurData?.pending_submissions.find((s) => s.soumission_id === soumissionId);
      const label = sub ? `« ${sub.controle_name} » (stagiaire #${sub.stagiaire_id})` : soumissionId.slice(0, 8);
      setActionMessage(`Note ${note}/20 publiée pour ${label}.`);
      await loadDashboard();
    }
  };

  const handlePublishCorrection = async (controleId: string) => {
    const texte = correctionText[controleId] ?? "";
    const pdf = correctionPdf[controleId] ?? null;
    const formData = new FormData();
    formData.append("titre", "Correction");
    formData.append("texte_correction", texte);
    if (pdf) formData.append("fichier_correction", pdf);
    const response = await apiFetch(`/api/instructeur/controles/${controleId}/publish-correction/`, {
      method: "POST",
      body: formData,
    });
    if (response.ok) {
      const ctrl = instructeurData?.controles_list.find((c) => c.id === controleId);
      const label = ctrl ? `« ${ctrl.name} »` : controleId.slice(0, 8);
      setActionMessage(`Correction publiée pour le contrôle ${label}.`);
      setCorrectionPdf((prev) => ({ ...prev, [controleId]: null }));
      await loadDashboard();
    }
  };

  const handleOpenModule = (module: { id: string; nom: string; matieres: Array<{ id: string; nom: string; cours_count: number }> }) => {
    setSelectedMatiere(null);
    setSelectedBrochure(null);
    setSelectedCours(null);
    setCoursFileCache({});
    setSelectedModule(module);
  };

  const handleOpenMatiere = async (matiereId: string) => {
    setSelectedBrochure(null);
    setSelectedCours(null);
    setCoursFileCache({});
    const response = await apiFetch(`/api/stageaire/matieres/${matiereId}/cours/`);
    if (!response.ok) return;
    const data = await response.json();
    setSelectedMatiere({ id: data.matiere_id, nom: data.matiere_nom, module_nom: data.module_nom, brochures: data.brochures ?? [], cours: data.cours });
  };

  const handleOpenBrochure = async (brochureId: string) => {
    setSelectedCours(null);
    setCoursFileCache({});
    const response = await apiFetch(`/api/stageaire/brochures/${brochureId}/cours/`);
    if (!response.ok) return;
    const data = await response.json();
    setSelectedBrochure({ id: data.brochure_id, nom: data.brochure_nom, matiere_nom: data.matiere_nom, module_nom: data.module_nom, cours: data.cours });
  };

  const openCoursModal = async (coursId: string) => {
    setLessonModalLoading(true);
    setLessonModal(null);
    const response = await apiFetch(`/api/stageaire/cours/${coursId}/`);
    if (!response.ok) { setLessonModalLoading(false); return; }
    const data = await response.json();
    const files: Record<string, { base64: string; name: string; mimeType: string }> = {};
    setLessonModal({ cours: data, files });
    setLessonModalLoading(false);
    // Fetch files in background, updating modal as each loads
    for (const f of data.fichiers ?? []) {
      apiFetch(`/api/stageaire/cours/${coursId}/fichier/${f.id_cours_fichier}/`).then(async (r) => {
        if (!r.ok) return;
        const fd: { fichier_base64: string; nom_fichier: string; mime_type: string } = await r.json();
        setLessonModal((prev) => prev ? { ...prev, files: { ...prev.files, [f.id_cours_fichier]: { base64: fd.fichier_base64, name: fd.nom_fichier, mimeType: fd.mime_type } } } : prev);
      });
    }
  };

  const handleSubmitAnswer = async (controlId: string) => {
    const commentaire = submissionAnswers[controlId] ?? "";
    const file = submissionFiles[controlId];
    let fichier_base64 = "";
    let nom_fichier = "";
    let mime_type = "";
    if (file) {
      fichier_base64 = await readFileAsBase64(file);
      nom_fichier = file.name;
      mime_type = file.type || "application/rtf";
    }
    const response = await apiFetch(`/api/stageaire/controls/${controlId}/submit/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commentaire, fichier_base64, nom_fichier, mime_type }),
    });
    if (response.ok) {
      setSubmissionFiles((prev) => { const next = { ...prev }; delete next[controlId]; return next; });
      const ctrl = stageaireData?.controls_list.find((c) => c.id === controlId);
      const ctrlName = ctrl?.name ?? stageaireData?.soumissions_detail.find((s) => s.controle_id === controlId)?.controle_name ?? controlId.slice(0, 8);
      const withFile = file ? ` avec fichier « ${file.name} »` : "";
      setActionMessage(`Réponse soumise pour « ${ctrlName} »${withFile}.`);
      await loadDashboard();
    }
  };

  const handleToggleUserStatus = async (targetUserId: number) => {
    const response = await apiFetch(`/api/admin/users/${targetUserId}/toggle-active/`, {
      method: "POST",
    });
    if (response.ok) {
      const target = adminData?.users.find((u) => u.id === targetUserId);
      const label = target ? `« ${target.username} » (${target.role})` : `#${targetUserId}`;
      const newStatus = target?.is_active ? "désactivé" : "activé";
      setActionMessage(`Compte ${label} ${newStatus}.`);
      await loadDashboard();
    }
  };

  const loadSubjects = async () => {
    const response = await apiFetch("/api/admin/subjects/");
    if (!response.ok) return;
    const data: { subjects: SubjectData[] } = await response.json();
    setSubjects(data.subjects);
    if (!selectedSubjectId && data.subjects.length > 0) {
      setSelectedSubjectId(data.subjects[0].id);
    }
  };

  const loadClasses = async () => {
    const response = await apiFetch("/api/admin/classes/");
    if (!response.ok) return;
    const data: { classes: AdminClassData[] } = await response.json();
    setClassesData(data.classes);
    if (!selectedClassId && data.classes.length > 0) {
      setSelectedClassId(data.classes[0].id);
    }
  };

  const loadAdminReferences = async () => {
    const response = await apiFetch("/api/admin/references/");
    if (!response.ok) return;
    const data: { corps: ReferenceCorp[]; ranks: ReferenceRank[]; specialities: ReferenceSpeciality[] } = await response.json();
    setReferencesData(data);
    if (!newRank.corps_id && data.corps.length > 0) {
      setNewRank((prev) => ({ ...prev, corps_id: data.corps[0].id }));
    }
  };

  const loadAdminEvents = async () => {
    const response = await apiFetch("/api/admin/events/?limit=200");
    if (!response.ok) return;
    const data: { events: AdminEventData[] } = await response.json();
    setAdminEvents(data.events);
  };

  const loadSubjectControls = async (subjectId: string) => {
    if (!subjectId) return;
    const response = await apiFetch(`/api/admin/subjects/${subjectId}/controls/`);
    if (!response.ok) return;
    const data: { controls: SubjectControlData[] } = await response.json();
    setSubjectControls(data.controls);
  };

  const loadSubjectCourses = async (subjectId: string) => {
    if (!subjectId) return;
    const response = await apiFetch(`/api/admin/subjects/${subjectId}/courses/`);
    if (!response.ok) return;
    const data: { courses: SubjectCourseData[] } = await response.json();
    setSubjectCourses(data.courses);
  };

  const handleCreateSubject = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const response = await apiFetch("/api/admin/subjects/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: newSubjectLabel }),
    });
    if (response.ok) {
      setActionMessage(`Sujet « ${newSubjectLabel} » créé.`);
      setNewSubjectLabel("");
      await loadSubjects();
    }
  };

  const handleCreateClass = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const response = await apiFetch("/api/admin/classes/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newClassForm),
    });
    if (response.ok) {
      setActionMessage(`Classe « ${newClassForm.libelle} » créée.`);
      setNewClassForm({ libelle: "" });
      await loadClasses();
    }
  };

  const handleAssignStageaireToClass = async () => {
    if (!selectedClassId || selectedStageaireIds.length === 0) return;
    await Promise.all(
      selectedStageaireIds.map((id) =>
        apiFetch(`/api/admin/classes/${selectedClassId}/assign-stageaire/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stageaire_id: id }),
        })
      )
    );
    const cls = classesData.find((c) => c.id === selectedClassId);
    setActionMessage(`${selectedStageaireIds.length} stagiaire(s) affecté(s) à la classe « ${cls?.code ?? selectedClassId} ».`);
    setSelectedStageaireIds([]);
    await loadClasses();
  };

  const handleAssignInstructeurToClass = async () => {
    if (!selectedClassId || selectedInstructeurIds.length === 0) return;
    await Promise.all(
      selectedInstructeurIds.map((id) =>
        apiFetch(`/api/admin/classes/${selectedClassId}/assign-instructeur/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ instructeur_id: id }),
        })
      )
    );
    const cls = classesData.find((c) => c.id === selectedClassId);
    setActionMessage(`${selectedInstructeurIds.length} instructeur(s) affecté(s) à la classe « ${cls?.code ?? selectedClassId} ».`);
    setSelectedInstructeurIds([]);
    await loadClasses();
  };

  const handleUpdateControlStatus = async (controlId: string, statusValue: string) => {
    const response = await apiFetch(`/api/admin/controls/${controlId}/status/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: statusValue }),
    });
    if (response.ok) {
      const ctrl = subjectControls.find((c) => c.id === controlId);
      setActionMessage(`Contrôle « ${ctrl?.name ?? controlId.slice(0, 8)} » passé en ${statusValue}.`);
      await loadSubjectControls(selectedSubjectId);
    }
  };

  const handleUpdateCourseStatus = async (courseId: string, statusValue: string) => {
    const response = await apiFetch(`/api/admin/courses/${courseId}/status/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: statusValue }),
    });
    if (response.ok) {
      const cours = subjectCourses.find((c) => c.id === courseId);
      setActionMessage(`Cours « ${cours?.title ?? courseId.slice(0, 8)} » passé en ${statusValue}.`);
      await loadSubjectCourses(selectedSubjectId);
    }
  };

  const handleExportCSV = async () => {
    const response = await apiFetch("/api/coordinateur/report/export/?format=csv");
    if (!response.ok) return;
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "rapport_coordinateur.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportXLSX = async () => {
    const response = await apiFetch("/api/coordinateur/report/export/?format=xlsx");
    if (!response.ok) return;
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "rapport_coordinateur.xlsx";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCreateAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const response = await apiFetch("/api/admin/accounts/create/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(accountForm),
    });
    if (response.ok) {
      const data: { username: string; password: string; role: string; matricule: string } = await response.json();
      setLastCreatedAccount({ username: data.username, password: data.password, role: data.role, matricule: data.matricule });
      setAccountForm({
        username: "",
        email: "",
        password: "",
        role: "Stagiaire",
        matricule: "",
        est_civil: false,
        corps_id: "",
        rank_id: "",
        speciality_id: "",
      });
      await reloadAdminData();
    }
  };

  const handleCreateCorps = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const response = await apiFetch("/api/admin/references/corps/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newCorps),
    });
    if (response.ok) {
      setActionMessage(`Corps « ${newCorps.label} » (${newCorps.code}) créé.`);
      setNewCorps({ code: "", label: "" });
      await loadAdminReferences();
    }
  };

  const handleCreateRank = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const response = await apiFetch("/api/admin/references/ranks/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newRank),
    });
    if (response.ok) {
      const corpsLabel = referencesData.corps.find((c) => c.id === newRank.corps_id)?.label ?? newRank.corps_id;
      setActionMessage(`Grade « ${newRank.label} » (${newRank.code}) ajouté au corps ${corpsLabel}.`);
      setNewRank((prev) => ({ ...prev, code: "", label: "" }));
      await loadAdminReferences();
    }
  };

  const handleCreateSpeciality = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const response = await apiFetch("/api/admin/references/specialities/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newSpeciality),
    });
    if (response.ok) {
      const corpsLabel = referencesData.corps.find((c) => c.id === newSpeciality.corps_id)?.label ?? "";
      const corpsInfo = corpsLabel ? ` (${corpsLabel})` : "";
      setActionMessage(`Spécialité « ${newSpeciality.label} » (${newSpeciality.code})${corpsInfo} créée.`);
      setNewSpeciality({ code: "", label: "", corps_id: "" });
      await loadAdminReferences();
    }
  };

  const handleRenameCorps = (corpsId: string, current: string, currentCode: string) => {
    setRenameModal({ open: true, target: "corps", id: corpsId, value: current, code: currentCode, corps_id: "" });
  };

  const handleRenameRank = (rankId: string, current: string, currentCode: string, currentCorpsId: string) => {
    setRenameModal({ open: true, target: "rank", id: rankId, value: current, code: currentCode, corps_id: currentCorpsId });
  };

  const handleRenameSpeciality = (specialityId: string, current: string, currentCode: string, currentCorpsId: string) => {
    setRenameModal({ open: true, target: "speciality", id: specialityId, value: current, code: currentCode, corps_id: currentCorpsId });
  };

  const handleDeleteCorps = async (corpsId: string, label: string) => {
    if (!window.confirm(`Supprimer le corps « ${label} » ? Cette action supprimera aussi tous les grades associés.`)) return;
    const response = await apiFetch(`/api/admin/references/corps/${corpsId}/`, { method: "DELETE" });
    if (response.ok || response.status === 204) {
      setActionMessage(`Corps « ${label} » supprimé.`);
      await loadAdminReferences();
    }
  };

  const handleDeleteRank = async (rankId: string, label: string) => {
    if (!window.confirm(`Supprimer le grade « ${label} » ?`)) return;
    const response = await apiFetch(`/api/admin/references/ranks/${rankId}/`, { method: "DELETE" });
    if (response.ok || response.status === 204) {
      setActionMessage(`Grade « ${label} » supprimé.`);
      await loadAdminReferences();
    }
  };

  const handleDeleteSpeciality = async (specialityId: string, label: string) => {
    if (!window.confirm(`Supprimer la spécialité « ${label} » ?`)) return;
    const response = await apiFetch(`/api/admin/references/specialities/${specialityId}/`, { method: "DELETE" });
    if (response.ok || response.status === 204) {
      setActionMessage(`Spécialité « ${label} » supprimée.`);
      await loadAdminReferences();
    }
  };

  const handleSubmitRename = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!renameModal.target || !renameModal.id || !renameModal.value.trim()) return;
    const endpoint =
      renameModal.target === "corps"
        ? `/api/admin/references/corps/${renameModal.id}/`
        : renameModal.target === "rank"
          ? `/api/admin/references/ranks/${renameModal.id}/`
          : `/api/admin/references/specialities/${renameModal.id}/`;
    const body: Record<string, string> = { label: renameModal.value.trim(), code: renameModal.code.trim() };
    if (renameModal.corps_id) body.corps_id = renameModal.corps_id;
    console.log("[edit] sending PATCH", endpoint, body);
    const response = await apiFetch(endpoint, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (response.ok) {
      const typeLabel = renameModal.target === "corps" ? "Corps" : renameModal.target === "rank" ? "Grade" : "Spécialité";
      setActionMessage(`${typeLabel} « ${renameModal.value.trim()} » mis à jour.`);
      setRenameModal({ open: false, target: null, id: "", value: "", code: "", corps_id: "" });
      await loadAdminReferences();
    }
  };

  const handleBulkCsvUpload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fileInput = document.getElementById("accounts-csv-input") as HTMLInputElement | null;
    const file = fileInput?.files?.[0];
    if (!file) return;
    const csvContent = await file.text();
    const response = await apiFetch("/api/admin/accounts/bulk-csv/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv_content: csvContent }),
    });
    const result = await response.json();
    if (response.ok) {
      const errNote = result.error_count ? ` (${result.error_count} lignes ignorees)` : "";
      setActionMessage(`Import termine: ${result.created_count} comptes crees${errNote}.`);
      setCsvErrors((result.errors as Array<{ line: number; error: string }>) ?? []);
      await reloadAdminData();
    } else if (result.errors?.length) {
      setCsvErrors(result.errors as Array<{ line: number; error: string }>);
      setActionMessage(`Import echoue â€” ${result.error_count ?? result.errors.length} erreur(s). Voir details ci-dessous.`);
    } else {
      setCsvErrors([]);
      setActionMessage(result.detail ?? "Import echoue.");
    }
  };

  const triggerDownload = (base64: string, name: string, mimeType: string) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: mimeType || "application/octet-stream" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = name;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const openFichierFromApi = async (url: string, fallbackName: string) => {
    const response = await apiFetch(url);
    if (!response.ok) { setActionMessage(`Fichier introuvable (${url.split("/").filter(Boolean).pop()}).`); return; }
    const data: { fichier_base64: string; nom_fichier: string; mime_type: string } = await response.json();
    const name = data.nom_fichier || fallbackName;
    const mime = data.mime_type || "";
    if (mime === "application/pdf" || name.toLowerCase().endsWith(".pdf")) {
      setPdfViewer({ base64: data.fichier_base64, name, mimeType: mime });
    } else {
      triggerDownload(data.fichier_base64, name, mime);
    }
  };

  const loadDetailControlePdf = async (controleId: string) => {
    setDetailControlePdfLoading(true);
    setDetailControlePdf(null);
    const response = await apiFetch(`/api/stageaire/controles/${controleId}/fichier/`);
    if (response.ok) {
      const data: { fichier_base64: string; nom_fichier: string; mime_type: string } = await response.json();
      setDetailControlePdf({ base64: data.fichier_base64, name: data.nom_fichier || "enonce", mimeType: data.mime_type || "" });
    }
    setDetailControlePdfLoading(false);
  };

  const loadCorrectionFichier = async (controleId: string) => {
    setCorrectionFichierLoading((prev) => ({ ...prev, [controleId]: true }));
    const response = await apiFetch(`/api/stageaire/controles/${controleId}/correction-fichier/`);
    if (response.ok) {
      const data: { fichier_base64: string; nom_fichier: string; mime_type: string } = await response.json();
      setCorrectionFichier((prev) => ({ ...prev, [controleId]: { base64: data.fichier_base64, name: data.nom_fichier || "correction.pdf", mimeType: data.mime_type || "application/pdf" } }));
    } else {
      setActionMessage("Aucun fichier de correction disponible pour ce contrôle.");
    }
    setCorrectionFichierLoading((prev) => ({ ...prev, [controleId]: false }));
  };

  const loadInstallFichiers = async () => {
    const r = await apiFetch("/api/installation-logiciels/fichiers/");
    if (r.ok) { const d: { fichiers: InstallFichier[] } = await r.json(); setInstallFichiers(d.fichiers); }
  };

  const handleInstallUpload = async () => {
    if (!installUploadFile) return;
    setInstallUploading(true);
    const fichier_base64 = await readFileAsBase64(installUploadFile);
    const r = await apiFetch("/api/instructeur/installation-logiciels/upload/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ titre: installUploadTitre || installUploadFile.name, fichier_base64, nom_fichier: installUploadFile.name, mime_type: installUploadFile.type || "application/octet-stream" }),
    });
    if (r.ok) {
      setInstallUploadFile(null);
      setInstallUploadTitre("");
      await loadInstallFichiers();
      setActionMessage("Fichier partagé avec succès.");
    }
    setInstallUploading(false);
  };

  const handleInstallDelete = async (id: string) => {
    if (!confirm("Supprimer ce fichier ?")) return;
    await apiFetch(`/api/instructeur/installation-logiciels/${id}/supprimer/`, { method: "DELETE" });
    await loadInstallFichiers();
  };

  const handleInstallDownload = async (id: string, nom: string) => {
    const r = await apiFetch(`/api/installation-logiciels/fichiers/${id}/`);
    if (!r.ok) { setActionMessage("Fichier introuvable."); return; }
    const d: { fichier_base64: string; nom_fichier: string; mime_type: string } = await r.json();
    triggerDownload(d.fichier_base64, d.nom_fichier || nom, d.mime_type);
  };

  const loadFeuilleRFichiers = async () => {
    const r = await apiFetch("/api/feuille-redaction/fichiers/");
    if (r.ok) { const d: { fichiers: InstallFichier[] } = await r.json(); setFeuilleRFichiers(d.fichiers); }
  };

  const handleFeuilleRUpload = async () => {
    if (!feuilleRUploadFile) return;
    setFeuilleRUploading(true);
    const fichier_base64 = await readFileAsBase64(feuilleRUploadFile);
    const r = await apiFetch("/api/admin/feuille-redaction/upload/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ titre: feuilleRUploadTitre || feuilleRUploadFile.name, fichier_base64, nom_fichier: feuilleRUploadFile.name, mime_type: feuilleRUploadFile.type || "application/octet-stream" }),
    });
    if (r.ok) {
      setFeuilleRUploadFile(null);
      setFeuilleRUploadTitre("");
      await loadFeuilleRFichiers();
      setActionMessage("Feuille de rédaction partagée avec succès.");
    }
    setFeuilleRUploading(false);
  };

  const handleFeuilleRDelete = async (id: string) => {
    if (!confirm("Supprimer ce fichier ?")) return;
    await apiFetch(`/api/admin/feuille-redaction/${id}/supprimer/`, { method: "DELETE" });
    await loadFeuilleRFichiers();
  };

  const handleFeuilleRDownload = async (id: string, nom: string) => {
    const r = await apiFetch(`/api/feuille-redaction/fichiers/${id}/`);
    if (!r.ok) { setActionMessage("Fichier introuvable."); return; }
    const d: { fichier_base64: string; nom_fichier: string; mime_type: string } = await r.json();
    triggerDownload(d.fichier_base64, d.nom_fichier || nom, d.mime_type);
  };

  const handleFeuilleRView = async (id: string, nom: string) => {
    const r = await apiFetch(`/api/feuille-redaction/fichiers/${id}/`);
    if (!r.ok) { setActionMessage("Fichier introuvable."); return; }
    const d: { fichier_base64: string; nom_fichier: string; mime_type: string } = await r.json();
    setPdfViewer({ base64: d.fichier_base64, name: d.nom_fichier || nom, mimeType: d.mime_type || "application/pdf" });
  };

  const readFileAsBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(",")[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  useEffect(() => {
      if (!user) return;
      if (user.role === "Admin") {
        void loadSubjects();
        void loadClasses();
      }
      if (user.role === "Admin") {
        void loadAdminReferences();
      }
    }, [user?.role]);

  useEffect(() => {
    if (!user) return;
    if (user.role === "Admin" && adminView === "events") {
      void loadAdminEvents();
    }
  }, [user?.role, adminView]);

  useEffect(() => {
    if (!user) return;
    if (user.role === "Admin" && adminView === "subjects" && subjectTab === "controls") {
      void loadSubjectControls(selectedSubjectId);
    }
  }, [user?.role, adminView, subjectTab, selectedSubjectId]);

  useEffect(() => {
    if (!user) return;
    if (user.role === "Admin" && adminView === "subjects" && subjectTab === "courses") {
      void loadSubjectCourses(selectedSubjectId);
    }
  }, [user?.role, adminView, subjectTab, selectedSubjectId]);

  useEffect(() => {
    if (actionMessage) {
      setToastState({ kind: "success", message: actionMessage, closing: false });
      const closeTimer = window.setTimeout(() => setToastState((prev) => (prev ? { ...prev, closing: true } : prev)), 2800);
      const clearTimer = window.setTimeout(() => {
        setToastState(null);
        setActionMessage(null);
      }, 3050);
      return () => {
        window.clearTimeout(closeTimer);
        window.clearTimeout(clearTimer);
      };
    }
  }, [actionMessage]);

  useEffect(() => {
    if (dashboardError) {
      setToastState({ kind: "error", message: dashboardError, closing: false });
      const closeTimer = window.setTimeout(() => setToastState((prev) => (prev ? { ...prev, closing: true } : prev)), 3200);
      const clearTimer = window.setTimeout(() => {
        setToastState(null);
        setDashboardError(null);
      }, 3450);
      return () => {
        window.clearTimeout(closeTimer);
        window.clearTimeout(clearTimer);
      };
    }
  }, [dashboardError]);

  if (!user) return <Navigate to="/login" replace />;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10">

      {user.role !== "Admin" ? (
        <section className="card-hover rounded-2xl border border-app-muted bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-app-accent">{t("dashboard.badge")}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-app-dark">
            {t(`workspace.${user.role}.title`)}
          </h1>
          <p className="mt-3 text-sm text-app-dark/80">{t(`workspace.${user.role}.summary`)}</p>
        </section>
      ) : null}

      {loading ? (
        <section className="mt-6 grid gap-5">
          <article className="card-hover card-hover rounded-2xl border border-app-muted bg-white p-6 shadow-sm">
            <div className="skeleton skeleton-title" />
            <div className="skeleton skeleton-line" />
            <div className="skeleton skeleton-line" />
          </article>
          <article className="card-hover card-hover rounded-2xl border border-app-muted bg-white p-6 shadow-sm">
            <div className="skeleton skeleton-block" />
          </article>
        </section>
      ) : null}

      {pdfViewer ? (
        <PdfViewer
          base64={pdfViewer.base64}
          name={pdfViewer.name}
          onClose={() => setPdfViewer(null)}
          onDownload={() => { triggerDownload(pdfViewer.base64, pdfViewer.name, pdfViewer.mimeType); }}
        />
      ) : null}

      {/* Lesson modal â€” centered overlay */}
      {(lessonModal || lessonModalLoading) ? (
        <div
          className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-app-dark/60 px-4"
          onClick={() => { setLessonModal(null); setLessonModalLoading(false); }}
        >
          <div
            className="modal-panel relative flex w-full max-w-4xl max-h-[90vh] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-4 rounded-t-2xl px-6 py-4" style={{ background: "#15173D" }}>
              <div className="min-w-0">
                {lessonModal ? (
                  <>
                    <p className="truncate text-lg font-bold text-white">{lessonModal.cours.titre}</p>
                    {lessonModal.cours.matiere ? (
                      <p className="mt-0.5 text-xs text-white/60">{lessonModal.cours.matiere}</p>
                    ) : null}
                  </>
                ) : (
                  <p className="text-sm text-white/70">Chargementâ€¦</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => { setLessonModal(null); setLessonModalLoading(false); }}
                className="shrink-0 rounded-lg px-2 py-1 text-white/70 transition hover:bg-white/10 hover:text-white"
                aria-label="Fermer"
              >
                âœ•
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {lessonModalLoading && !lessonModal ? (
                <div className="flex flex-col gap-3">
                  <div className="skeleton skeleton-title" />
                  <div className="skeleton skeleton-line" />
                  <div className="skeleton skeleton-block" />
                </div>
              ) : lessonModal ? (
                <>
                  {/* Meta */}
                  <div className="flex flex-wrap items-center gap-3 text-xs text-app-dark/50">
                    <span>Instructeur : <span className="font-semibold text-app-dark">{lessonModal.cours.instructeur}</span></span>
                    <span>Déposé le <span className="font-medium text-app-dark">{lessonModal.cours.date_depot}</span></span>
                  </div>

                  {/* Description */}
                  {lessonModal.cours.description ? (
                    <p className="rounded-xl border border-app-muted bg-app-soft/60 px-4 py-3 text-sm text-app-dark/80 whitespace-pre-wrap">
                      {lessonModal.cours.description}
                    </p>
                  ) : null}

                  {/* Files */}
                  {lessonModal.cours.fichiers.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-app-muted p-6 text-center">
                      <p className="text-sm italic text-app-dark/40">Aucun fichier disponible.</p>
                    </div>
                  ) : (
                    lessonModal.cours.fichiers.map((f) => {
                      const cached = lessonModal.files[f.id_cours_fichier];
                      const isPdf = cached
                        ? cached.mimeType === "application/pdf" || cached.name.toLowerCase().endsWith(".pdf")
                        : f.mime_type === "application/pdf" || f.nom_fichier.toLowerCase().endsWith(".pdf");
                      const isDocx = cached
                        ? cached.name.toLowerCase().endsWith(".docx") || cached.name.toLowerCase().endsWith(".doc")
                        : f.nom_fichier.toLowerCase().endsWith(".docx") || f.nom_fichier.toLowerCase().endsWith(".doc");

                      if (!cached) {
                        return (
                          <div key={f.id_cours_fichier} className="flex items-center gap-3 rounded-xl border border-app-muted bg-white px-4 py-4">
                            <div className="skeleton h-5 w-5 rounded" />
                            <span className="text-sm text-app-dark/50">Chargement de {f.nom_fichier}â€¦</span>
                          </div>
                        );
                      }

                      if (isPdf) {
                        return <InlinePdfViewer key={f.id_cours_fichier} base64={cached.base64} name={cached.name} />;
                      }

                      if (isDocx) {
                        return <InlineDocxViewer key={f.id_cours_fichier} base64={cached.base64} name={cached.name} />;
                      }

                      return (
                        <div key={f.id_cours_fichier} className="flex items-center gap-3 rounded-xl border border-app-muted bg-white px-4 py-4">
                          <span className="text-base">ðŸ“Ž</span>
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-app-dark">{cached.name}</p>
                            <p className="text-xs text-app-dark/40">Aperçu non disponible pour ce format</p>
                          </div>
                          <button
                            type="button"
                            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white"
                            style={{ background: "#982598" }}
                            onClick={() => triggerDownload(cached.base64, cached.name, cached.mimeType)}
                          >
                            ↓ Télécharger
                          </button>
                        </div>
                      );
                    })
                  )}
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {toastState ? (
        <div className={`fixed right-4 top-20 z-40 max-w-md rounded-lg px-4 py-3 text-sm shadow-lg ${toastState.kind === "success" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-700"} ${toastState.closing ? "toast-exit" : `toast-enter ${toastState.kind === "error" ? "shake-error" : ""}`}`}>
          <span className={toastState.kind === "success" ? "checkmark-pop font-semibold" : "font-semibold"}>
            {toastState.kind === "success" ? "âœ“ " : "âš  "}
          </span>
          {toastState.message}
        </div>
      ) : null}

      {user.role === "Instructeur" && instructeurData ? (
        <section className="mt-6 grid gap-5 md:grid-cols-[220px_1fr]">
          {/* Sidebar */}
          <aside className="sidebar-animated card-hover rounded-2xl border border-app-muted bg-white p-4 shadow-sm self-start">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-app-accent">Espace Instructeur</p>
            <div className="mt-3 grid gap-1">
              <AdminNavButton active={instructeurView === "dashboard"} onClick={() => setInstructeurView("dashboard")}>
                Tableau de bord
              </AdminNavButton>
              <AdminNavButton active={instructeurView === "cours"} onClick={() => setInstructeurView("cours")}>
                Cours ({instructeurData.cours.total})
              </AdminNavButton>
              <AdminNavButton active={instructeurView === "controles"} onClick={() => setInstructeurView("controles")}>
                Contrôles ({instructeurData.controles.total})
              </AdminNavButton>
              <AdminNavButton active={instructeurView === "corriger"} onClick={() => setInstructeurView("corriger")}>
                Corriger{instructeurData.controles.pending_corrections > 0 ? ` (${instructeurData.controles.pending_corrections})` : ""}
              </AdminNavButton>
              <AdminNavButton active={instructeurView === "sujet"} onClick={() => setInstructeurView("sujet")}>
                Sujet fin de stage ({instructeurData.sujets_fin_stage.total})
              </AdminNavButton>
              <AdminNavButton active={instructeurView === "installation_logiciels"} onClick={() => setInstructeurView("installation_logiciels")}>
                Installation & Logiciels
              </AdminNavButton>
            </div>
          </aside>
          {/* Content */}
          <div className="min-w-0 grid gap-5 content-start">

          {/* Dashboard */}
          {instructeurView === "dashboard" ? (
            <>
              {/* Connexion card */}
              <article className="rounded-2xl border border-app-muted bg-white p-6 shadow-sm">
                <div className="flex items-center gap-4">
                  <div
                    className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-xl font-bold text-white"
                    style={{ background: "#15173D" }}
                  >
                    {user?.username?.[0]?.toUpperCase() ?? "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-lg font-semibold truncate">{user?.username}</p>
                    <p className="text-sm text-app-dark/60">{user?.role}</p>
                  </div>
                  <span
                    className="shrink-0 rounded-full px-3 py-1 text-xs font-semibold text-white"
                    style={{ background: "#22c55e" }}
                  >
                    Connecté
                  </span>
                </div>
                <div className="mt-4 grid gap-2 md:grid-cols-3 border-t border-app-muted/60 pt-4">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-app-dark/50">Matricule</p>
                    <p className="mt-0.5 text-sm font-semibold">{user?.matricule || "â€”"}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-app-dark/50">Corps</p>
                    <p className="mt-0.5 text-sm font-semibold">{user?.corps?.label ?? (user?.est_civil ? "Civil" : "â€”")}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-app-dark/50">Email</p>
                    <p className="mt-0.5 text-sm font-semibold truncate">{user?.email || "â€”"}</p>
                  </div>
                </div>
              </article>

              <article className="card-hover rounded-2xl border border-app-muted bg-white p-6 shadow-sm">
                <h3 className="text-lg font-semibold">Affectations et activité</h3>
                <div className="mt-3 grid gap-2 md:grid-cols-3">
                  <div className="rounded-lg border border-app-muted/70 bg-app-soft px-3 py-2">
                    <p className="text-xs uppercase tracking-wide text-app-dark/60">Classes</p>
                    <p className="mt-1 text-xl font-semibold">{instructeurData.classes_count}</p>
                  </div>
                  <div className="rounded-lg border border-app-muted/70 bg-app-soft px-3 py-2">
                    <p className="text-xs uppercase tracking-wide text-app-dark/60">Cours publiés</p>
                    <p className="mt-1 text-xl font-semibold">{instructeurData.cours.published} <span className="text-sm font-normal text-app-dark/50">/ {instructeurData.cours.total}</span></p>
                  </div>
                  <div className="rounded-lg border border-app-muted/70 bg-app-soft px-3 py-2">
                    <p className="text-xs uppercase tracking-wide text-app-dark/60">Ã€ corriger</p>
                    <p className="mt-1 text-xl font-semibold text-app-accent">{instructeurData.controles.pending_corrections}</p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {instructeurData.classes.map((c) => (
                    <span className="rounded bg-app-soft px-2 py-1 text-xs" key={c.code}>{c.code} / {c.brigade}</span>
                  ))}
                  {instructeurData.classes.length === 0 ? <EmptyState message="Aucune classe assignee." /> : null}
                </div>
                <p className="mt-4 text-sm text-app-dark/60">Notifications non lues: <span className="font-semibold text-app-dark">{instructeurData.notifications.unread_count}</span></p>
              </article>
            </>
          ) : null}

          {/* Cours */}
          {instructeurView === "cours" ? (
            <>
              <article className="card-hover rounded-2xl border border-app-muted bg-white p-6 shadow-sm">
                <h3 className="text-lg font-semibold">Créer un cours</h3>
                <form className="mt-3 grid gap-3 md:grid-cols-2" onSubmit={handleCreateCourse}>
                  <Input label="Titre" value={courseTitle} onChange={setCourseTitle} />
                  <Input label="Description" value={courseDescription} onChange={setCourseDescription} />
                  <label className="grid gap-1 text-sm">
                    Module
                    <select
                      className="rounded border border-app-muted bg-white px-3 py-2 text-sm"
                      value={courseModuleId}
                      onChange={(e) => { setCourseModuleId(e.target.value); setCourseMatiereId(""); }}
                    >
                      <option value="">â€” Sélectionner un module â€”</option>
                      {modulesList.map((m) => (
                        <option key={m.id} value={m.id}>{m.nom}</option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm">
                    Matière
                    <select
                      className="rounded border border-app-muted bg-white px-3 py-2 text-sm"
                      value={courseMatiereId}
                      onChange={(e) => setCourseMatiereId(e.target.value)}
                      disabled={!courseModuleId}
                    >
                      <option value="">â€” Sélectionner une matière â€”</option>
                      {(modulesList.find((m) => m.id === courseModuleId)?.matieres ?? []).map((mat) => (
                        <option key={mat.id} value={mat.id}>{mat.nom}</option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm md:col-span-2">
                    Classe (optionnel)
                    <select
                      className="rounded border border-app-muted bg-white px-3 py-2 text-sm"
                      value={courseClasseId}
                      onChange={(e) => setCourseClasseId(e.target.value)}
                    >
                      <option value="">â€” Toutes les classes â€”</option>
                      {instructeurData.classes.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label} ({c.code} Â· Brigade {c.brigade})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm md:col-span-2">
                    Fichier RTF (optionnel)
                    <input
                      accept=".rtf,.doc,.docx,.pdf,application/rtf,text/rtf"
                      className="rounded border border-app-muted bg-white px-3 py-2 text-sm"
                      type="file"
                      onChange={(e) => setCourseFichierFile(e.target.files?.[0] ?? null)}
                    />
                    {courseFichierFile ? <span className="text-xs text-app-dark/60">{courseFichierFile.name}</span> : null}
                  </label>
                  <button className="rounded bg-app-dark px-3 py-2 text-sm font-semibold text-white md:col-span-2" type="submit">
                    Créer et publier le cours
                  </button>
                </form>
              </article>

              <article className="card-hover rounded-2xl border border-app-muted bg-white p-6 shadow-sm">
                <h3 className="text-lg font-semibold">Mes cours</h3>
                <div className="mt-3 flex items-center gap-2 rounded-lg border border-app-muted bg-app-soft px-3 py-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0 text-app-dark/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                  </svg>
                  <input
                    className="w-full bg-transparent text-sm outline-none placeholder:text-app-dark/40"
                    placeholder="Rechercher un coursâ€¦"
                    value={instructeurCoursSearch}
                    onChange={(e) => setInstructeurCoursSearch(e.target.value)}
                  />
                  {instructeurCoursSearch ? (
                    <button className="text-app-dark/40 hover:text-app-dark" onClick={() => setInstructeurCoursSearch("")} type="button">âœ•</button>
                  ) : null}
                </div>
                <div className="mt-3 space-y-2">
                  {instructeurData.cours_list
                    .filter((c) => c.title.toLowerCase().includes(instructeurCoursSearch.toLowerCase()))
                    .map((c) => (
                      <div className="flex items-center gap-3 rounded-xl border border-app-muted bg-white px-4 py-3" key={c.id}>
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white" style={{ background: "#15173D" }}>
                          {c.title[0]?.toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="truncate text-sm font-semibold text-app-dark">{c.title}</p>
                          <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${c.status === "PUBLIE" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                            {c.status}
                          </span>
                        </div>
                        <button
                          type="button"
                          title="Supprimer le cours"
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-sm text-red-500 transition hover:bg-red-100 hover:text-red-700"
                          onClick={async () => {
                            if (!confirm(`Supprimer le cours « ${c.title} » ?`)) return;
                            await apiFetch(`/api/instructeur/cours/${c.id}/delete/`, { method: "DELETE" });
                            await loadDashboard();
                          }}
                        >
                          ðŸ—‘
                        </button>
                      </div>
                    ))}
                  {instructeurData.cours_list.length === 0 ? <EmptyState message="Aucun cours créé." /> : null}
                  {instructeurData.cours_list.length > 0 && instructeurCoursSearch && instructeurData.cours_list.filter((c) => c.title.toLowerCase().includes(instructeurCoursSearch.toLowerCase())).length === 0 ? (
                    <p className="text-sm text-app-dark/50">Aucun résultat pour « {instructeurCoursSearch} ».</p>
                  ) : null}
                </div>
              </article>
            </>
          ) : null}

          {/* Contrôles */}
          {instructeurView === "controles" ? (
            <>
              <article className="card-hover rounded-2xl border border-app-muted bg-white p-6 shadow-sm">
                <h3 className="text-lg font-semibold">Créer un contrôle</h3>
                <form className="mt-3 grid gap-3 md:grid-cols-2" onSubmit={handleCreateControl}>
                  <label className="grid gap-1 text-sm">
                    Cours
                    <select
                      className="rounded border border-app-muted bg-white px-3 py-2"
                      value={controlCoursId}
                      onChange={(event) => setControlCoursId(event.target.value)}
                      required
                    >
                      <option value="">Selectionner</option>
                      {instructeurData.cours_list.map((c) => (
                        <option key={c.id} value={c.id}>{c.title}</option>
                      ))}
                    </select>
                    {instructeurData.cours_list.length === 0 ? <EmptyState message="Aucun cours disponible. Créez un cours d'abord." /> : null}
                  </label>
                  <Input label="Nom du contrôle" value={controlName} onChange={setControlName} />
                  <Input label="Énoncé (texte)" value={controlPrompt} onChange={setControlPrompt} />
                  <label className="grid gap-1 text-sm md:col-span-2">
                    Énoncé RTF (optionnel)
                    <input
                      accept=".rtf,.doc,.docx,.pdf,application/rtf,text/rtf"
                      className="rounded border border-app-muted bg-white px-3 py-2 text-sm"
                      type="file"
                      onChange={(e) => setControlEnonceFichier(e.target.files?.[0] ?? null)}
                    />
                    {controlEnonceFichier ? <span className="text-xs text-app-dark/60">{controlEnonceFichier.name}</span> : null}
                  </label>
                  <button className="rounded bg-app-dark px-3 py-2 text-sm font-semibold text-white md:col-span-2" type="submit">
                    Publier contrôle
                  </button>
                </form>
              </article>

              <article className="card-hover rounded-2xl border border-app-muted bg-white p-6 shadow-sm">
                <h3 className="text-lg font-semibold">Mes contrôles</h3>
                <div className="mt-3 space-y-2">
                  {instructeurData.controles_list.map((c) => (
                    <div className="flex items-center gap-3 rounded-xl border border-app-muted bg-white px-4 py-3" key={c.id}>
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white" style={{ background: "#982598" }}>
                        {c.name[0]?.toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-sm font-semibold text-app-dark">{c.name}</p>
                        <p className="truncate text-xs text-app-dark/50">{c.cours_title}</p>
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${c.status === "PUBLIE" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                          {c.status}
                        </span>
                      </div>
                      <button
                        type="button"
                        title="Supprimer le contrôle"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-sm text-red-500 transition hover:bg-red-100 hover:text-red-700"
                        onClick={async () => {
                          if (!confirm(`Supprimer le contrôle « ${c.name} » ?`)) return;
                          await apiFetch(`/api/instructeur/controles/${c.id}/delete/`, { method: "DELETE" });
                          await loadDashboard();
                        }}
                      >
                        ðŸ—‘
                      </button>
                    </div>
                  ))}
                  {instructeurData.controles_list.length === 0 ? <EmptyState message="Aucun contrôle créé." /> : null}
                </div>
              </article>

              <article className="card-hover rounded-2xl border border-app-muted bg-white p-6 shadow-sm">
                <h3 className="text-lg font-semibold">Corrections officielles</h3>
                <p className="mt-1 text-sm text-app-dark/60">Publiez la correction modèle pour chaque contrôle. Les stagiaires pourront la consulter.</p>
                <div className="mt-4 space-y-3">
                  {instructeurData.controles_list.map((c) => (
                    <div className="rounded-xl border border-app-muted p-4" key={c.id}>
                      <div className="flex items-start gap-3 mb-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white" style={{ background: "#15173D" }}>
                          {c.name[0]?.toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-app-dark">{c.name}</p>
                          <p className="text-xs text-app-dark/50">{c.cours_title}</p>
                        </div>
                        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${c.status === "PUBLIE" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                          {c.status}
                        </span>
                      </div>
                      <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-app-dark/50">
                        Texte de la correction officielle
                        <textarea
                          rows={3}
                          className="rounded-lg border border-app-muted bg-app-soft px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none focus:border-app-accent focus:ring-2 focus:ring-app-accent/20 resize-none"
                          placeholder="Rédigez la correction modèleâ€¦"
                          value={correctionText[c.id] ?? ""}
                          onChange={(e) => setCorrectionText((prev) => ({ ...prev, [c.id]: e.target.value }))}
                        />
                      </label>
                      <div className="mt-2 grid gap-1">
                        <p className="text-xs font-semibold uppercase tracking-wide text-app-dark/50">Correction PDF (corrigé officiel)</p>
                        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-app-muted bg-app-soft px-3 py-2 text-xs text-app-dark/60 hover:border-app-accent hover:bg-white transition">
                          <svg className="h-4 w-4 shrink-0 text-app-accent" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                          {correctionPdf[c.id] ? correctionPdf[c.id]!.name : "Joindre un PDFâ€¦"}
                          <input type="file" accept=".pdf" className="hidden" onChange={(e) => setCorrectionPdf((prev) => ({ ...prev, [c.id]: e.target.files?.[0] ?? null }))} />
                        </label>
                        {correctionPdf[c.id] && (
                          <button type="button" className="self-start text-xs text-red-400 hover:text-red-600" onClick={() => setCorrectionPdf((prev) => ({ ...prev, [c.id]: null }))}>Retirer le fichier</button>
                        )}
                      </div>
                      <button
                        className="mt-2 rounded-lg bg-app-dark px-4 py-1.5 text-xs font-semibold text-white transition hover:opacity-80 disabled:opacity-40"
                        type="button"
                        disabled={!correctionText[c.id] && !correctionPdf[c.id]}
                        onClick={() => void handlePublishCorrection(c.id)}
                      >
                        Publier correction
                      </button>
                    </div>
                  ))}
                  {instructeurData.controles_list.length === 0 ? <EmptyState message="Aucun contrôle pour le moment." /> : null}
                </div>
              </article>
            </>
          ) : null}

          {/* Corriger contrôle */}
          {instructeurView === "corriger" ? (
            <>
              {/* â”€â”€ Soumissions à noter â”€â”€ */}
              <div className="overflow-hidden rounded-2xl border border-app-muted bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-app-muted px-6 py-4" style={{ background: "#15173D" }}>
                  <div>
                    <p className="text-base font-bold text-white">Soumissions à noter</p>
                    <p className="text-xs text-white/50 mt-0.5">Évaluez les réponses des stagiaires</p>
                  </div>
                  <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-bold text-white">
                    {instructeurData.pending_submissions.length} en attente
                  </span>
                </div>

                <div className="divide-y divide-app-muted/40">
                  {instructeurData.pending_submissions.length === 0 && (
                    <div className="flex flex-col items-center gap-2 py-10 text-center">
                      <span className="text-3xl">âœ…</span>
                      <p className="text-sm font-medium text-app-dark/50">Aucune soumission en attente</p>
                    </div>
                  )}
                  {instructeurData.pending_submissions.map((s) => {
                    return (
                      <div key={s.soumission_id} className="p-5">
                        {/* Card header */}
                        <div className="flex items-start gap-4 mb-4">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white" style={{ background: "#982598" }}>
                            {String(s.stagiaire_id).slice(-2)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-app-dark">{s.controle_name}</p>
                            <p className="text-xs text-app-dark/50 mt-0.5">
                              Stagiaire #{s.stagiaire_id} Â· soumis le {new Date(s.submitted_at).toLocaleDateString("fr-FR")}
                            </p>
                          </div>
                          <span className="shrink-0 rounded-full bg-yellow-100 px-2.5 py-0.5 text-[11px] font-semibold text-yellow-700">En attente</span>
                        </div>

                        {/* Download */}
                        <button
                          type="button"
                          className="mb-4 flex items-center gap-2 rounded-lg border border-app-muted bg-app-soft px-3 py-2 text-xs font-medium text-app-dark transition hover:border-app-accent hover:bg-white"
                          onClick={() => void openFichierFromApi(`/api/instructeur/soumissions/${s.soumission_id}/fichier/`, "reponse.rtf")}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-app-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                          Télécharger la réponse RTF
                        </button>

                        {/* Evaluation fields */}
                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="grid gap-1">
                            <label className="text-xs font-semibold uppercase tracking-wide text-app-dark/50">Note /20</label>
                            <input
                              type="number"
                              min="0" max="20"
                              className="rounded-lg border border-app-muted bg-app-soft px-3 py-2 text-sm outline-none focus:border-app-accent focus:ring-2 focus:ring-app-accent/20"
                              placeholder="ex : 15"
                              value={evalNote[s.soumission_id] ?? ""}
                              onChange={(e) => setEvalNote((prev) => ({ ...prev, [s.soumission_id]: e.target.value }))}
                            />
                          </div>
                          <div className="grid gap-1">
                            <label className="text-xs font-semibold uppercase tracking-wide text-app-dark/50">Commentaire</label>
                            <input
                              className="rounded-lg border border-app-muted bg-app-soft px-3 py-2 text-sm outline-none focus:border-app-accent focus:ring-2 focus:ring-app-accent/20"
                              placeholder="Remarque optionnelleâ€¦"
                              value={evalCorrection[s.soumission_id] ?? ""}
                              onChange={(e) => setEvalCorrection((prev) => ({ ...prev, [s.soumission_id]: e.target.value }))}
                            />
                          </div>
                        </div>
                        <button
                          type="button"
                          className="mt-3 rounded-xl px-5 py-2 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-40"
                          style={{ background: "#982598" }}
                          disabled={!evalNote[s.soumission_id]}
                          onClick={() => void handleEvaluate(s.soumission_id)}
                        >
                          âœ“ Publier la note
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* â”€â”€ Publier la correction â”€â”€ */}
              <div className="overflow-hidden rounded-2xl border border-app-muted bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-app-muted px-6 py-4" style={{ background: "#15173D" }}>
                  <div>
                    <p className="text-base font-bold text-white">Publier la correction officielle</p>
                    <p className="text-xs text-white/50 mt-0.5">Rédigez la correction modèle pour chaque contrôle</p>
                  </div>
                  <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-bold text-white">
                    {instructeurData.controles_list.length} contrôle(s)
                  </span>
                </div>

                <div className="divide-y divide-app-muted/40">
                  {instructeurData.controles_list.length === 0 && (
                    <div className="flex flex-col items-center gap-2 py-10 text-center">
                      <span className="text-3xl">ðŸ“‹</span>
                      <p className="text-sm font-medium text-app-dark/50">Aucun contrôle disponible</p>
                    </div>
                  )}
                  {instructeurData.controles_list.map((c) => (
                    <div key={c.id} className="p-5">
                      {/* Header */}
                      <div className="flex items-start gap-4 mb-4">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white" style={{ background: "#15173D" }}>
                          {c.name[0]?.toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-app-dark">{c.name}</p>
                          <p className="text-xs text-app-dark/50 mt-0.5">{c.cours_title}</p>
                        </div>
                        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${c.status === "PUBLIE" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                          {c.status}
                        </span>
                      </div>

                      {/* Correction textarea */}
                      <div className="grid gap-1 mb-3">
                        <label className="text-xs font-semibold uppercase tracking-wide text-app-dark/50">Texte de correction</label>
                        <textarea
                          rows={3}
                          className="rounded-lg border border-app-muted bg-app-soft px-3 py-2 text-sm outline-none focus:border-app-accent focus:ring-2 focus:ring-app-accent/20 resize-none"
                          placeholder="Rédigez la correction modèleâ€¦"
                          value={correctionText[c.id] ?? ""}
                          onChange={(e) => setCorrectionText((prev) => ({ ...prev, [c.id]: e.target.value }))}
                        />
                      </div>
                      {/* PDF correction */}
                      <div className="grid gap-1 mb-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-app-dark/50">Correction PDF (corrigé officiel)</p>
                        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-app-muted bg-app-soft px-3 py-2 text-xs text-app-dark/60 hover:border-app-accent hover:bg-white transition">
                          <svg className="h-4 w-4 shrink-0 text-app-accent" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                          {correctionPdf[c.id] ? correctionPdf[c.id]!.name : "Joindre un PDFâ€¦"}
                          <input type="file" accept=".pdf" className="hidden" onChange={(e) => setCorrectionPdf((prev) => ({ ...prev, [c.id]: e.target.files?.[0] ?? null }))} />
                        </label>
                        {correctionPdf[c.id] && (
                          <button type="button" className="self-start text-xs text-red-400 hover:text-red-600" onClick={() => setCorrectionPdf((prev) => ({ ...prev, [c.id]: null }))}>Retirer le fichier</button>
                        )}
                      </div>
                      <button
                        type="button"
                        className="rounded-xl px-5 py-2 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-40"
                        style={{ background: "#982598" }}
                        disabled={!correctionText[c.id] && !correctionPdf[c.id]}
                        onClick={() => void handlePublishCorrection(c.id)}
                      >
                        âœ“ Publier la correction
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : null}

          {/* Installation & Logiciels */}
          {instructeurView === "installation_logiciels" ? (
            <div className="grid gap-5">
              {/* Upload form */}
              <div className="overflow-hidden rounded-2xl border border-app-muted bg-white shadow-sm">
                <div className="flex items-center gap-3 border-b border-app-muted px-6 py-4" style={{ background: "#15173D" }}>
                  <svg className="h-4 w-4 text-white/70" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                  <p className="font-bold text-white">Partager un fichier Word</p>
                </div>
                <div className="p-5 grid gap-3">
                  <div className="grid gap-1">
                    <label className="text-xs font-semibold uppercase tracking-wide text-app-dark/50">Titre (optionnel)</label>
                    <input
                      className="rounded-xl border border-app-muted bg-app-soft px-4 py-2.5 text-sm outline-none focus:border-app-accent focus:ring-2 focus:ring-app-accent/20"
                      placeholder="Ex : Guide d'installation Visual Studioâ€¦"
                      value={installUploadTitre}
                      onChange={(e) => setInstallUploadTitre(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-1">
                    <label className="text-xs font-semibold uppercase tracking-wide text-app-dark/50">Fichier Word (.doc, .docx)</label>
                    <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-app-muted bg-app-soft px-4 py-3 transition hover:border-app-accent hover:bg-white">
                      <svg className="h-5 w-5 shrink-0 text-app-accent" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                      <span className="text-sm text-app-dark/60">{installUploadFile ? installUploadFile.name : "Choisir un fichier Wordâ€¦"}</span>
                      <input type="file" accept=".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" onChange={(e) => setInstallUploadFile(e.target.files?.[0] ?? null)} />
                    </label>
                  </div>
                  <button
                    type="button"
                    disabled={!installUploadFile || installUploading}
                    onClick={() => void handleInstallUpload()}
                    className="flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-40"
                    style={{ background: "#15173D" }}
                  >
                    {installUploading ? (
                      <svg className="h-4 w-4 animate-spin" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 100 16v-4l-3 3 3 3v-4a8 8 0 01-8-8z" /></svg>
                    ) : (
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                    )}
                    {installUploading ? "Envoi en coursâ€¦" : "Partager le fichier"}
                  </button>
                </div>
              </div>

              {/* Files list */}
              <div className="overflow-hidden rounded-2xl border border-app-muted bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-app-muted px-6 py-4" style={{ background: "#15173D" }}>
                  <p className="font-bold text-white">Fichiers partagés</p>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-white/20 px-3 py-0.5 text-xs font-bold text-white">{installFichiers.length}</span>
                    <button type="button" onClick={() => void loadInstallFichiers()} className="flex items-center gap-1 rounded-lg border border-white/20 px-2.5 py-1 text-xs font-semibold text-white/80 hover:bg-white/10 transition">
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                      Actualiser
                    </button>
                  </div>
                </div>
                <div className="divide-y divide-app-muted/40">
                  {installFichiers.length === 0 ? (
                    <div className="flex flex-col items-center gap-3 py-10 text-center">
                      <svg className="h-10 w-10 text-app-dark/15" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                      <p className="text-sm text-app-dark/40">Aucun fichier partagé pour le moment.</p>
                    </div>
                  ) : installFichiers.map((f) => (
                    <div key={f.id} className="flex items-center gap-4 px-5 py-3">
                      <svg className="h-8 w-8 shrink-0 text-blue-500" fill="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM6 20V4h5v7h7v9H6z"/></svg>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-app-dark truncate">{f.titre}</p>
                        <p className="text-xs text-app-dark/40">{f.nom_fichier} Â· {new Date(f.uploaded_at).toLocaleDateString("fr-FR")}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button type="button" onClick={() => void handleInstallDownload(f.id, f.nom_fichier)} className="flex items-center gap-1.5 rounded-lg border border-app-muted bg-app-soft px-3 py-1.5 text-xs font-semibold text-app-dark transition hover:bg-white">
                          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                          Télécharger
                        </button>
                        <button type="button" onClick={() => void handleInstallDelete(f.id)} className="flex h-7 w-7 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-500 hover:bg-red-100 transition" title="Supprimer">
                          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {/* Sujet fin de stage */}
          {instructeurView === "sujet" ? (
            <>
              <article className="card-hover rounded-2xl border border-app-muted bg-white p-6 shadow-sm">
                <h3 className="text-lg font-semibold">Sujets fin de stage encadrés</h3>
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  <div className="rounded-lg border border-app-muted/70 bg-app-soft px-3 py-2">
                    <p className="text-xs uppercase tracking-wide text-app-dark/60">Total</p>
                    <p className="mt-1 text-xl font-semibold">{instructeurData.sujets_fin_stage.total}</p>
                  </div>
                  <div className="rounded-lg border border-app-muted/70 bg-app-soft px-3 py-2">
                    <p className="text-xs uppercase tracking-wide text-app-dark/60">En cours</p>
                    <p className="mt-1 text-xl font-semibold text-app-accent">{instructeurData.sujets_fin_stage.active}</p>
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  {instructeurData.sujets_fin_stage.list.map((s, i) => (
                    <div className="rounded border border-app-muted p-3" key={i}>
                      <p className="text-sm font-semibold">{s.sujet}</p>
                      <p className="text-xs text-app-dark/60">Stagiaire #{s.stagiaire_id} Â· État: <span className={s.etat === "EN_COURS" ? "text-app-accent font-semibold" : ""}>{s.etat}</span></p>
                    </div>
                  ))}
                  {instructeurData.sujets_fin_stage.list.length === 0 ? <EmptyState message="Aucun sujet de fin de stage assigné." /> : null}
                </div>
              </article>
            </>
          ) : null}
          </div>
        </section>
      ) : null}

      {user.role === "Stagiaire" && stageaireData ? (
        <section className="mt-6 flex gap-0 min-h-[calc(100vh-120px)]">
          {/* â”€â”€ Sidebar â”€â”€ */}
          <aside className="sidebar-animated w-56 min-w-[14rem] flex-shrink-0 flex flex-col overflow-hidden rounded-l-2xl border border-r-0 border-app-muted bg-white shadow-sm">

            {/* Profile header */}
            <div className="px-4 pt-5 pb-4 border-b border-app-muted/60" style={{ background: "linear-gradient(160deg,#15173D 0%,#1E1F4A 100%)" }}>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full text-base font-bold text-white ring-2 ring-white/20" style={{ background: "#982598" }}>
                  {user.username.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-white">{user.username}</p>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    <p className="text-xs text-white/50">Stagiaire</p>
                  </div>
                </div>
              </div>
              {/* Mini progress bar */}
              {stageaireData.controls.available_count > 0 && (
                <div className="mt-3">
                  <div className="flex justify-between text-xs text-white/50 mb-1">
                    <span>Progression contrôles</span>
                    <span>{stageaireData.controls.submitted_count}/{stageaireData.controls.available_count}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${Math.min(100, Math.round((stageaireData.controls.submitted_count / stageaireData.controls.available_count) * 100))}%`, background: "#982598" }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Nav items */}
            <nav className="flex-1 px-2 py-3 space-y-0.5">

              {/* Dashboard */}
              {(["dashboard"] as const).map((tab) => {
                const active = stageaireView === tab;
                return (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => { setStageaireView(tab); setSelectedModule(null); setSelectedMatiere(null); setSelectedBrochure(null); setSelectedCours(null); setCoursFileCache({}); setDetailControleId(null); setDetailControlePdf(null); }}
                    className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition text-left"
                    style={{ background: active ? "#15173D" : "transparent", color: active ? "white" : "#15173D" }}
                  >
                    <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                    </svg>
                    <span className="flex-1">Tableau de bord</span>
                  </button>
                );
              })}

              {/* Modules collapsible */}
              <div>
                <button
                  type="button"
                  onClick={() => {
                    setModulesExpanded((prev) => !prev);
                    setStageaireView("cours");
                    setSelectedMatiere(null);
                    setSelectedBrochure(null);
                    setSelectedCours(null);
                    setCoursFileCache({});
                  }}
                  className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition text-left"
                  style={{ background: stageaireView === "cours" ? "#15173D" : "transparent", color: stageaireView === "cours" ? "white" : "#15173D" }}
                >
                  <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={stageaireView === "cours" ? 2.5 : 2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                  <span className="flex-1">Modules</span>
                  <span className="shrink-0 rounded-full px-1.5 py-0.5 text-xs font-bold leading-none" style={{ background: stageaireView === "cours" ? "rgba(255,255,255,0.2)" : "#e5e7eb", color: stageaireView === "cours" ? "white" : "#374151" }}>
                    {(stageaireData.modules_list ?? []).length}
                  </span>
                  <svg className="h-3 w-3 shrink-0 transition-transform" style={{ transform: modulesExpanded ? "rotate(90deg)" : "rotate(0deg)", opacity: 0.6 }} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
                {modulesExpanded && (
                  <div className="mt-0.5 ml-3 space-y-0.5 border-l-2 border-app-muted pl-2">
                    {(stageaireData.modules_list ?? []).map((m) => {
                      const isModActive = stageaireView === "cours" && selectedModule?.id === m.id;
                      return (
                        <button
                          key={`sidebar-mod-${m.id}`}
                          type="button"
                          onClick={() => { setStageaireView("cours"); handleOpenModule(m); }}
                          className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium transition text-left"
                          style={{ background: isModActive ? "#15173D" : "transparent", color: isModActive ? "white" : "#15173D" }}
                          title={m.nom}
                        >
                          <svg className="h-3 w-3 shrink-0 opacity-60" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" /></svg>
                          <span className="flex-1 truncate">{m.nom}</span>
                          <span className="shrink-0 rounded-full px-1.5 py-0.5 text-xs font-bold leading-none" style={{ background: isModActive ? "rgba(255,255,255,0.2)" : "#e5e7eb", color: isModActive ? "white" : "#374151" }}>
                            {m.matieres.length}
                          </span>
                        </button>
                      );
                    })}
                    {(stageaireData.modules_list ?? []).length === 0 && (
                      <p className="px-2 py-1.5 text-xs italic text-app-dark/40">Aucun module</p>
                    )}
                  </div>
                )}
              </div>

              {/* Contrôles */}
              {(["controles"] as const).map((tab) => {
                const active = stageaireView === tab;
                const badge = stageaireData.controls.pending_count;
                return (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => { setStageaireView(tab); setSelectedModule(null); setSelectedMatiere(null); setSelectedBrochure(null); setSelectedCours(null); setCoursFileCache({}); setDetailControleId(null); setDetailControlePdf(null); }}
                    className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition text-left"
                    style={{ background: active ? "#15173D" : "transparent", color: active ? "white" : "#15173D" }}
                  >
                    <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                    </svg>
                    <span className="flex-1">Contrôles</span>
                    {badge > 0 && (
                      <span className="shrink-0 rounded-full px-1.5 py-0.5 text-xs font-bold leading-none" style={{ background: active ? "rgba(255,255,255,0.2)" : "#982598", color: "white" }}>
                        {badge}
                      </span>
                    )}
                  </button>
                );
              })}


              {/* Sujet fin de stage */}
              {(["sujet"] as const).map((tab) => {
                const active = stageaireView === tab;
                return (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => { setStageaireView(tab); setSelectedModule(null); setSelectedMatiere(null); setSelectedBrochure(null); setSelectedCours(null); setCoursFileCache({}); setDetailControleId(null); setDetailControlePdf(null); }}
                    className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition text-left"
                    style={{ background: active ? "#15173D" : "transparent", color: active ? "white" : "#15173D" }}
                  >
                    <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span className="flex-1">Sujet fin de stage</span>
                    {stageaireData.sujet_fin_stage && (
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: stageaireData.sujet_fin_stage.etat === "EN_COURS" ? "#982598" : "#22c55e" }} />
                    )}
                  </button>
                );
              })}

              {/* Installation & Logiciels */}
              {(["installation_logiciels"] as const).map((tab) => {
                const active = stageaireView === tab;
                return (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => { setStageaireView(tab); setSelectedModule(null); setSelectedMatiere(null); setSelectedBrochure(null); setSelectedCours(null); setCoursFileCache({}); setDetailControleId(null); setDetailControlePdf(null); void loadInstallFichiers(); }}
                    className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition text-left"
                    style={{ background: active ? "#15173D" : "transparent", color: active ? "white" : "#15173D" }}
                  >
                    <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    <span className="flex-1">Installation & Logiciels</span>
                  </button>
                );
              })}

              {/* Feuille de rédaction */}
              {(["feuille_redaction"] as const).map((tab) => {
                const active = stageaireView === tab;
                return (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => { setStageaireView(tab); setSelectedModule(null); setSelectedMatiere(null); setSelectedBrochure(null); setSelectedCours(null); setCoursFileCache({}); setDetailControleId(null); setDetailControlePdf(null); void loadFeuilleRFichiers(); }}
                    className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition text-left"
                    style={{ background: active ? "#15173D" : "transparent", color: active ? "white" : "#15173D" }}
                  >
                    <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    <span className="flex-1">Feuille de rédaction</span>
                  </button>
                );
              })}

            </nav>

            {/* Footer stats */}
            <div className="px-4 py-3 border-t border-app-muted/60 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-app-dark/40">Résumé</p>
              <div className="grid grid-cols-3 gap-1 text-center">
                <div className="rounded-lg bg-app-soft py-2">
                  <p className="text-base font-black text-app-dark">{(stageaireData.cours_list ?? []).length}</p>
                  <p className="text-xs text-app-dark/50">Cours</p>
                </div>
                <div className="rounded-lg bg-app-soft py-2">
                  <p className="text-base font-black text-emerald-600">{stageaireData.controls.submitted_count}</p>
                  <p className="text-xs text-app-dark/50">Soumis</p>
                </div>
                <div className="rounded-lg py-2" style={{ background: stageaireData.controls.pending_count > 0 ? "rgba(152,37,152,0.1)" : "#F1E9E9" }}>
                  <p className="text-base font-black" style={{ color: stageaireData.controls.pending_count > 0 ? "#982598" : "#15173D" }}>{stageaireData.controls.pending_count}</p>
                  <p className="text-xs text-app-dark/50">Attente</p>
                </div>
              </div>
            </div>
          </aside>

          {/* â”€â”€ Main content â”€â”€ */}
          <div className="flex-1 overflow-y-auto rounded-r-2xl border border-app-muted bg-app-soft/40 p-6 grid gap-5 content-start">

            {/* â”€â”€ DASHBOARD â”€â”€ */}
            {stageaireView === "dashboard" ? (
              <>
                {/* Hero banner */}
                <div className="relative overflow-hidden rounded-2xl p-8 shadow-lg" style={{ background: "linear-gradient(135deg,#0E0F29 0%,#15173D 60%,#1E1F4A 100%)" }}>
                  <div className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full opacity-10" style={{ background: "#982598" }} />
                  <div className="pointer-events-none absolute -bottom-8 right-24 h-32 w-32 rounded-full opacity-10" style={{ background: "#982598" }} />
                  <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-widest text-white/50">Espace Stagiaire</p>
                      <h1 className="mt-1 text-2xl font-black uppercase leading-tight text-white md:text-3xl">
                        Bienvenue,<br /><span style={{ color: "#E491C9" }}>{user.username}</span>
                      </h1>
                      <p className="mt-2 max-w-sm text-sm text-white/60">Accédez à vos cours, suivez vos contrôles et consultez votre progression.</p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button className="rounded-xl px-4 py-2 text-sm font-bold text-white transition hover:opacity-90" style={{ background: "#982598" }} onClick={() => { setStageaireView("cours"); setModulesExpanded(true); }} type="button">
                          Mes modules â†’
                        </button>
                        {stageaireData.controls.pending_count > 0 && (
                          <button className="rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20" onClick={() => setStageaireView("controles")} type="button">
                            {stageaireData.controls.pending_count} contrôle{stageaireData.controls.pending_count > 1 ? "s" : ""} en attente
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-3">
                      {[
                        { label: "Cours", value: (stageaireData.cours_list ?? []).length, color: "white" },
                        { label: "Contrôles", value: stageaireData.controls.available_count, color: "#E491C9" },
                        { label: "Soumis", value: stageaireData.controls.submitted_count, color: "#22c55e" },
                      ].map((s) => (
                        <div key={s.label} className="flex flex-col items-center justify-center rounded-2xl px-4 py-3 text-center" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}>
                          <p className="text-2xl font-black" style={{ color: s.color }}>{s.value}</p>
                          <p className="mt-0.5 text-xs font-medium text-white/50">{s.label}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Quick actions */}
                <div className="grid gap-3 md:grid-cols-3">
                  <button
                    type="button"
                    onClick={() => { setStageaireView("cours"); setModulesExpanded(true); }}
                    className="group flex items-center gap-4 rounded-2xl border border-app-muted bg-white p-5 text-left shadow-sm transition hover:border-app-dark/30 hover:shadow-md"
                  >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ background: "rgba(21,23,61,0.08)" }}>
                      <svg className="h-5 w-5 text-app-dark" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-app-dark">Consulter les cours</p>
                      <p className="mt-0.5 text-xs text-app-dark/50">{(stageaireData.modules_list ?? []).length} module{(stageaireData.modules_list ?? []).length !== 1 ? "s" : ""} disponible{(stageaireData.modules_list ?? []).length !== 1 ? "s" : ""}</p>
                    </div>
                    <svg className="ml-auto h-4 w-4 shrink-0 text-app-dark/30 transition group-hover:translate-x-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                  </button>

                  <button
                    type="button"
                    onClick={() => setStageaireView("controles")}
                    className="group flex items-center gap-4 rounded-2xl border bg-white p-5 text-left shadow-sm transition hover:shadow-md"
                    style={{ borderColor: stageaireData.controls.pending_count > 0 ? "rgba(152,37,152,0.35)" : undefined }}
                  >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ background: stageaireData.controls.pending_count > 0 ? "rgba(152,37,152,0.1)" : "rgba(21,23,61,0.08)" }}>
                      <svg className="h-5 w-5" style={{ color: stageaireData.controls.pending_count > 0 ? "#982598" : "#15173D" }} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-app-dark">Mes contrôles</p>
                      <p className="mt-0.5 text-xs" style={{ color: stageaireData.controls.pending_count > 0 ? "#982598" : "rgba(21,23,61,0.5)" }}>
                        {stageaireData.controls.pending_count > 0 ? `${stageaireData.controls.pending_count} en attente` : `${stageaireData.controls.submitted_count} soumis`}
                      </p>
                    </div>
                    <svg className="ml-auto h-4 w-4 shrink-0 text-app-dark/30 transition group-hover:translate-x-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                  </button>

                  <button
                    type="button"
                    onClick={() => { setStageaireView("controles"); setSelectedModule(null); setSelectedMatiere(null); setSelectedBrochure(null); setSelectedCours(null); setCoursFileCache({}); }}
                    className="group flex items-center gap-4 rounded-2xl border border-app-muted bg-white p-5 text-left shadow-sm transition hover:border-app-dark/30 hover:shadow-md"
                  >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ background: "rgba(21,23,61,0.08)" }}>
                      <svg className="h-5 w-5 text-app-dark" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-app-dark">Mes réponses</p>
                      <p className="mt-0.5 text-xs text-app-dark/50">{(stageaireData.soumissions_detail ?? []).length} soumission{(stageaireData.soumissions_detail ?? []).length !== 1 ? "s" : ""}</p>
                    </div>
                    <svg className="ml-auto h-4 w-4 shrink-0 text-app-dark/30 transition group-hover:translate-x-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                  </button>
                </div>

                {/* Profile + Classes */}
                <div className="grid gap-4 md:grid-cols-2">
                  {/* Profile card */}
                  <article className="rounded-2xl border border-app-muted bg-white p-5 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-wider text-app-dark/40 mb-3">Mon profil</p>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-bold text-white" style={{ background: "#15173D" }}>
                        {user?.username?.[0]?.toUpperCase() ?? "?"}
                      </div>
                      <div>
                        <p className="font-semibold text-app-dark">{user?.username}</p>
                        <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Connecté
                        </span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 border-t border-app-muted/60 pt-3">
                      {[
                        { label: "Matricule", value: user?.matricule || "â€”" },
                        { label: "Corps", value: user?.corps?.label ?? (user?.est_civil ? "Civil" : "â€”") },
                        { label: "Email", value: user?.email || "â€”" },
                        { label: "Spécialité", value: user?.speciality?.label || "â€”" },
                      ].map((f) => (
                        <div key={f.label}>
                          <p className="text-xs text-app-dark/40">{f.label}</p>
                          <p className="mt-0.5 text-sm font-semibold truncate text-app-dark">{f.value}</p>
                        </div>
                      ))}
                    </div>
                    {/* Fichier de renseignement â€” only shown until submitted */}
                    {stagiaireFichierStatus !== null && !stagiaireFichierStatus.has_fichier && (
                      <div className="border-t border-app-muted/60 pt-3 mt-3">
                        <p className="text-xs font-semibold uppercase tracking-wider text-app-dark/40 mb-2">Fichier de renseignement</p>
                        <div className="flex flex-col gap-2">
                          <button
                            className="flex items-center gap-2 rounded-lg border border-app-muted bg-app-soft px-3 py-1.5 text-xs font-semibold text-app-dark hover:border-app-dark/30 hover:bg-white transition"
                            onClick={() => void handleStageaireDownloadTemplate()}
                            type="button"
                          >
                            <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                            Telecharger Fichier de renseignement
                          </button>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-app-muted bg-white px-2.5 py-1.5 text-xs font-medium text-app-dark hover:border-app-dark/30 transition min-w-0">
                              <svg className="h-3 w-3 shrink-0 text-app-dark/50" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                              <span className="truncate max-w-[120px]">{stagiaireFichierUploadFile ? stagiaireFichierUploadFile.name : "Choisir un fichier"}</span>
                              <input type="file" className="hidden" onChange={(e) => setStagiaireFichierUploadFile(e.target.files?.[0] ?? null)} />
                            </label>
                            <button
                              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-white transition disabled:opacity-40"
                              style={{ background: "#15173D" }}
                              disabled={!stagiaireFichierUploadFile || stagiaireFichierUploading}
                              onClick={() => void handleStageaireUploadFichierRenseignement()}
                              type="button"
                            >
                              <svg className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                              {stagiaireFichierUploading ? "Envoi..." : "Soumettre"}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </article>

                  {/* Notes */}
                  {stageaireData.notes.length > 0 && (
                  <article className="rounded-2xl border border-app-muted bg-white p-5 shadow-sm">
                    <>
                        <p className="text-xs font-semibold uppercase tracking-wider text-app-dark/40 mb-2">Notes publiées</p>
                        <div className="space-y-1.5">
                          {stageaireData.notes.slice(0, 3).map((note, index) => (
                            <div key={`${note.controle}-${index}`} className="flex items-center justify-between rounded-lg border border-app-muted/60 bg-app-soft px-3 py-1.5">
                              <p className="text-xs truncate text-app-dark/70 flex-1 mr-2">{note.controle}</p>
                              <span className="shrink-0 rounded-full px-2 py-0.5 text-xs font-bold text-white" style={{ background: parseFloat(note.note) >= 10 ? "#22c55e" : "#ef4444" }}>
                                {note.note}/20
                              </span>
                            </div>
                          ))}
                          {stageaireData.notes.length > 3 && (
                            <button type="button" onClick={() => { setStageaireView("controles"); setSelectedModule(null); setSelectedMatiere(null); setSelectedBrochure(null); setSelectedCours(null); setCoursFileCache({}); }} className="text-xs text-app-accent font-semibold hover:underline">
                              +{stageaireData.notes.length - 3} autre{stageaireData.notes.length - 3 > 1 ? "s" : ""} â†’
                            </button>
                          )}
                        </div>
                    </>
                  </article>
                  )}
                </div>

                {stageaireData.notifications.latest.length > 0 && (
                  <article className="rounded-2xl border border-app-muted bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs font-semibold uppercase tracking-wider text-app-dark/40">Notifications récentes</p>
                      {stageaireData.notifications.unread_count > 0 && (
                        <span className="rounded-full px-2 py-0.5 text-xs font-bold text-white" style={{ background: "#982598" }}>
                          {stageaireData.notifications.unread_count} non lues
                        </span>
                      )}
                    </div>
                    <div className="space-y-2">
                      {stageaireData.notifications.latest.map((n) => (
                        <div key={`notif-${n.id}`} className="flex gap-3 rounded-xl border border-app-muted/60 bg-app-soft/60 p-3">
                          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full" style={{ background: "rgba(152,37,152,0.12)" }}>
                            {n.type === "nouveau_cours" ? (
                              <svg className="h-4 w-4 text-app-accent" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                            ) : n.type === "correction_publiee" ? (
                              <svg className="h-4 w-4 text-emerald-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            ) : (
                              <svg className="h-4 w-4 text-app-accent" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-app-dark">{n.title}</p>
                            {n.message && <p className="mt-0.5 text-xs text-app-dark/60 line-clamp-2">{n.message}</p>}
                            <p className="mt-1 text-xs text-app-dark/35">{new Date(n.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </article>
                )}
              </>
            ) : null}

            {/* â”€â”€ COURS â€” no module selected â”€â”€ */}
            {stageaireView === "cours" && !selectedModule && !selectedMatiere && !selectedCours ? (
              <article className="rounded-2xl border border-app-muted bg-white p-8 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wider text-app-dark/40 mb-4">Modules de formation</p>
                {(stageaireData.modules_list ?? []).length > 0 ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    {(stageaireData.modules_list ?? []).map((m) => (
                      <button
                        key={`mod-${m.id}`}
                        type="button"
                        onClick={() => { handleOpenModule(m); setModulesExpanded(true); }}
                        className="group flex items-center gap-4 rounded-xl border border-app-muted bg-app-soft/40 p-4 text-left transition hover:border-app-dark/30 hover:bg-white hover:shadow-sm"
                      >
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: "#15173D" }}>
                          <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-app-dark truncate">{m.nom}</p>
                          <p className="mt-0.5 text-xs text-app-dark/50">{m.matieres.length} matière{m.matieres.length !== 1 ? "s" : ""}</p>
                        </div>
                        <svg className="h-4 w-4 shrink-0 text-app-dark/30 transition group-hover:translate-x-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3 py-12 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full" style={{ background: "rgba(21,23,61,0.06)" }}>
                      <svg className="h-7 w-7 text-app-dark/30" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                    </div>
                    <div>
                      <p className="font-semibold text-app-dark/50">Aucun module disponible</p>
                      <p className="mt-1 text-xs text-app-dark/35">Les modules de formation apparaîtront ici une fois assignés.</p>
                    </div>
                  </div>
                )}
              </article>
            ) : null}

            {/* â”€â”€ COURS â€” matière list within a module â”€â”€ */}
            {stageaireView === "cours" && selectedModule && !selectedMatiere && !selectedCours ? (
              <>
                {/* Breadcrumb */}
                <nav className="flex items-center gap-1.5 text-xs">
                  <button type="button" onClick={() => setSelectedModule(null)} className="text-app-dark/50 hover:text-app-dark transition">Modules</button>
                  <svg className="h-3 w-3 text-app-dark/30" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                  <span className="font-semibold text-app-dark truncate">{selectedModule.nom}</span>
                </nav>

                <article className="rounded-2xl border border-app-muted bg-white p-6 shadow-sm">
                  <div className="flex items-center gap-3 mb-5">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: "#15173D" }}>
                      <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-app-dark">{selectedModule.nom}</h3>
                      <p className="text-xs text-app-dark/50">{selectedModule.matieres.length} matière{selectedModule.matieres.length !== 1 ? "s" : ""}</p>
                    </div>
                  </div>
                  {selectedModule.matieres.length > 0 ? (
                    <div className="grid gap-3 md:grid-cols-2">
                      {selectedModule.matieres.map((mat) => (
                        <button
                          key={`mat-${mat.id}`}
                          type="button"
                          onClick={() => void handleOpenMatiere(mat.id)}
                          className="group flex items-center gap-3 rounded-xl border border-app-muted bg-app-soft/40 p-4 text-left transition hover:border-app-dark/30 hover:bg-white hover:shadow-sm"
                        >
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: "rgba(152,37,152,0.1)" }}>
                            <svg className="h-4 w-4 text-app-accent" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm text-app-dark truncate">{mat.nom}</p>
                            <p className="mt-0.5 text-xs text-app-dark/50">{mat.cours_count} cours</p>
                          </div>
                          {mat.cours_count > 0 ? (
                            <span className="shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold text-white" style={{ background: "#15173D" }}>{mat.cours_count}</span>
                          ) : (
                            <span className="shrink-0 rounded-full bg-app-muted/50 px-2 py-0.5 text-xs text-app-dark/40">0</span>
                          )}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2 py-8 text-center">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-app-soft">
                        <svg className="h-6 w-6 text-app-dark/30" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                      </div>
                      <p className="text-sm text-app-dark/40 italic">Aucune matière dans ce module.</p>
                    </div>
                  )}
                </article>
              </>
            ) : null}

            {/* â”€â”€ COURS â€” matière: brochures or direct cours â”€â”€ */}
            {stageaireView === "cours" && selectedMatiere && !selectedBrochure && !selectedCours ? (
              <>
                {/* Breadcrumb */}
                <nav className="flex items-center gap-1.5 text-xs flex-wrap">
                  <button type="button" onClick={() => setSelectedModule(null)} className="text-app-dark/50 hover:text-app-dark transition">Modules</button>
                  <svg className="h-3 w-3 text-app-dark/30" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                  <button type="button" onClick={() => setSelectedMatiere(null)} className="text-app-dark/50 hover:text-app-dark transition">{selectedMatiere.module_nom}</button>
                  <svg className="h-3 w-3 text-app-dark/30" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                  <span className="font-semibold text-app-dark">{selectedMatiere.nom}</span>
                </nav>

                {selectedMatiere.brochures.length > 0 ? (
                  <article className="rounded-2xl border border-app-muted bg-white p-6 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-wider text-app-dark/40 mb-4">Brochures â€” {selectedMatiere.nom}</p>
                    <div className="grid gap-3 md:grid-cols-2">
                      {selectedMatiere.brochures.map((b) => (
                        <button key={`brochure-${b.id}`} type="button" onClick={() => void handleOpenBrochure(b.id)}
                          className="group flex items-center gap-3 rounded-xl border border-app-muted bg-app-soft/40 p-4 text-left transition hover:border-app-dark/30 hover:bg-white hover:shadow-sm">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: "rgba(21,23,61,0.08)" }}>
                            <svg className="h-4 w-4 text-app-dark" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" /></svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-semibold text-sm text-app-dark truncate">{b.nom}</p>
                              <TagBadge nom={b.nom} />
                            </div>
                            <p className="mt-0.5 text-xs text-app-dark/50">{b.cours_count} cours</p>
                          </div>
                          {b.cours_count > 0 ? (
                            <span className="shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold text-white" style={{ background: "#15173D" }}>{b.cours_count}</span>
                          ) : (
                            <span className="shrink-0 rounded-full bg-app-muted/50 px-2 py-0.5 text-xs text-app-dark/40">0</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </article>
                ) : (
                  <article className="rounded-2xl border border-app-muted bg-white p-6 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-wider text-app-dark/40 mb-4">Cours â€” {selectedMatiere.nom}</p>
                    {selectedMatiere.cours.length > 0 ? (
                      <div className="grid gap-3 md:grid-cols-2">
                        {selectedMatiere.cours.map((c) => (
                          <button key={`cours-${c.id}`} type="button" onClick={() => void openCoursModal(c.id)}
                            className="group flex items-start gap-3 rounded-xl border border-app-muted bg-app-soft/40 p-4 text-left transition hover:border-app-accent/30 hover:bg-white hover:shadow-sm">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: "rgba(152,37,152,0.1)" }}>
                              <svg className="h-4 w-4 text-app-accent" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" /><path strokeLinecap="round" strokeLinejoin="round" d="M14 2v6h6M16 13H8M16 17H8M10 9H8" /></svg>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start gap-2 flex-wrap mb-0.5">
                                <p className="font-semibold text-sm text-app-dark leading-snug">{c.titre}</p>
                                <CourseTagBadge titre={c.titre} />
                              </div>
                              {c.description && <p className="mt-0.5 text-xs text-app-dark/50 line-clamp-2">{c.description}</p>}
                              <div className="mt-2 flex items-center gap-2 flex-wrap">
                                <span className="text-xs text-app-dark/40">{c.instructeur}</span>
                                {c.controles_count > 0 && (
                                  <span className="rounded-full px-1.5 py-0.5 text-xs font-semibold text-white" style={{ background: "#982598" }}>
                                    {c.controles_count} contrôle{c.controles_count > 1 ? "s" : ""}
                                  </span>
                                )}
                              </div>
                            </div>
                            <svg className="mt-1 h-4 w-4 shrink-0 text-app-dark/20 transition group-hover:translate-x-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2 py-8 text-center">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-app-soft">
                          <svg className="h-6 w-6 text-app-dark/30" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" /></svg>
                        </div>
                        <p className="text-sm text-app-dark/40 italic">Aucun cours dans cette matière.</p>
                      </div>
                    )}
                  </article>
                )}
              </>
            ) : null}

            {/* â”€â”€ COURS â€” brochure cours list â”€â”€ */}
            {stageaireView === "cours" && selectedBrochure && !selectedCours ? (
              <>
                {/* Breadcrumb */}
                <nav className="flex items-center gap-1.5 text-xs flex-wrap">
                  <button type="button" onClick={() => { setSelectedBrochure(null); setSelectedMatiere(null); setSelectedModule(null); }} className="text-app-dark/50 hover:text-app-dark transition">Modules</button>
                  <svg className="h-3 w-3 text-app-dark/30" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                  <button type="button" onClick={() => setSelectedBrochure(null)} className="text-app-dark/50 hover:text-app-dark transition">{selectedBrochure.matiere_nom}</button>
                  <svg className="h-3 w-3 text-app-dark/30" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                  <span className="font-semibold text-app-dark">{selectedBrochure.nom}</span>
                </nav>

                <article className="rounded-2xl border border-app-muted bg-white p-6 shadow-sm">
                  <div className="flex items-center gap-3 flex-wrap mb-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-app-dark/40">Cours â€” {selectedBrochure.nom}</p>
                    <TagBadge nom={selectedBrochure.nom} />
                  </div>
                  {selectedBrochure.cours.length > 0 ? (
                    <div className="grid gap-3 md:grid-cols-2">
                      {selectedBrochure.cours.map((c) => (
                        <button key={`cours-${c.id}`} type="button" onClick={() => void openCoursModal(c.id)}
                          className="group flex items-start gap-3 rounded-xl border border-app-muted bg-app-soft/40 p-4 text-left transition hover:border-app-accent/30 hover:bg-white hover:shadow-sm">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: "rgba(152,37,152,0.1)" }}>
                            <svg className="h-4 w-4 text-app-accent" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" /><path strokeLinecap="round" strokeLinejoin="round" d="M14 2v6h6M16 13H8M16 17H8M10 9H8" /></svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start gap-2 flex-wrap mb-0.5">
                              <p className="font-semibold text-sm text-app-dark leading-snug">{c.titre}</p>
                              <CourseTagBadge titre={c.titre} />
                            </div>
                            {c.description && <p className="mt-0.5 text-xs text-app-dark/50 line-clamp-2">{c.description}</p>}
                            <div className="mt-2 flex items-center gap-2 flex-wrap">
                              <span className="text-xs text-app-dark/40">{c.instructeur}</span>
                              {c.controles_count > 0 && (
                                <span className="rounded-full px-1.5 py-0.5 text-xs font-semibold text-white" style={{ background: "#982598" }}>
                                  {c.controles_count} contrôle{c.controles_count > 1 ? "s" : ""}
                                </span>
                              )}
                            </div>
                          </div>
                          <svg className="mt-1 h-4 w-4 shrink-0 text-app-dark/20 transition group-hover:translate-x-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2 py-8 text-center">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-app-soft">
                        <svg className="h-6 w-6 text-app-dark/30" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" /></svg>
                      </div>
                      <p className="text-sm text-app-dark/40 italic">Aucun cours dans cette brochure.</p>
                    </div>
                  )}
                </article>
              </>
            ) : null}

            {/* Cours â€” detail with PDF viewer */}
            {stageaireView === "cours" && selectedCours ? (
              <>
                {/* Back button + header */}
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => { setSelectedCours(null); setCoursFileCache({}); }}
                    className="flex items-center gap-1.5 rounded-lg border border-app-muted bg-white px-3 py-2 text-sm font-semibold text-app-dark shadow-sm transition hover:bg-app-soft"
                  >
                    â† Retour aux cours
                  </button>
                  {selectedCours.matiere ? (
                    <span className="text-sm text-app-dark/50">{selectedCours.matiere}</span>
                  ) : null}
                </div>

                {/* Course meta */}
                <article className="rounded-2xl border border-app-muted bg-white p-5 shadow-sm">
                  <div className="flex items-start gap-3 flex-wrap">
                    <h2 className="text-xl font-bold text-app-dark flex-1">{selectedCours.titre}</h2>
                    <CourseTagBadge titre={selectedCours.titre} />
                  </div>
                  {selectedCours.description ? (
                    <p className="mt-2 text-sm text-app-dark/70 whitespace-pre-wrap">{selectedCours.description}</p>
                  ) : null}
                  <p className="mt-3 text-xs text-app-dark/50">Instructeur : <span className="font-semibold text-app-dark">{selectedCours.instructeur}</span> &mdash; Déposé le {selectedCours.date_depot}</p>
                </article>

                {/* Course files â€” inline viewer */}
                {selectedCours.fichiers.map((f) => {
                  const cached = coursFileCache[f.id_cours_fichier];
                  const isPdf = cached
                    ? cached.mimeType === "application/pdf" || cached.name.toLowerCase().endsWith(".pdf")
                    : f.mime_type === "application/pdf" || f.nom_fichier.toLowerCase().endsWith(".pdf");
                  const isDocx = cached
                    ? cached.name.toLowerCase().endsWith(".docx") || cached.name.toLowerCase().endsWith(".doc")
                    : f.nom_fichier.toLowerCase().endsWith(".docx") || f.nom_fichier.toLowerCase().endsWith(".doc");

                  if (!cached) {
                    // Still loading
                    return (
                      <div key={f.id_cours_fichier} className="flex items-center gap-3 rounded-xl border border-app-muted bg-white px-4 py-4">
                        <div className="skeleton h-5 w-5 rounded" />
                        <span className="text-sm text-app-dark/50">Chargement de {f.nom_fichier}â€¦</span>
                      </div>
                    );
                  }

                  if (isPdf) {
                    return (
                      <InlinePdfViewer key={f.id_cours_fichier} base64={cached.base64} name={cached.name} />
                    );
                  }

                  if (isDocx) {
                    return <InlineDocxViewer key={f.id_cours_fichier} base64={cached.base64} name={cached.name} />;
                  }

                  // Non-PDF: show label with download button
                  return (
                    <div key={f.id_cours_fichier} className="flex items-center gap-3 rounded-xl border border-app-muted bg-white px-4 py-4">
                      <span className="text-base">ðŸ“Ž</span>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-app-dark">{cached.name}</p>
                        <p className="text-xs text-app-dark/40">Aperçu non disponible pour ce format</p>
                      </div>
                      <button
                        type="button"
                        className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white"
                        style={{ background: "#982598" }}
                        onClick={() => triggerDownload(cached.base64, cached.name, cached.mimeType)}
                      >
                        ↓ Télécharger
                      </button>
                    </div>
                  );
                })}
                {selectedCours.fichiers.length === 0 && (
                  <div className="rounded-xl border border-dashed border-app-muted bg-white p-6 text-center">
                    <p className="text-sm text-app-dark/40 italic">Aucun fichier de cours disponible.</p>
                  </div>
                )}

                {/* Contrôles */}
                {selectedCours.controles.length > 0 ? (
                  <article className="rounded-2xl border border-app-muted bg-white p-5 shadow-sm">
                    <h4 className="font-semibold text-app-dark">Contrôles associés</h4>
                    <div className="mt-3 space-y-2">
                      {selectedCours.controles.map((ctrl) => (
                        <div className="rounded-xl border border-app-muted p-3" key={ctrl.id}>
                          <p className="text-sm font-semibold">{ctrl.nom}</p>
                          {ctrl.enonce ? <p className="mt-1 text-xs text-app-dark/60">{ctrl.enonce}</p> : null}
                          <p className="mt-1 text-xs text-app-dark/40">Barème: {ctrl.bareme}{ctrl.date_limite ? ` | Limite: ${ctrl.date_limite}` : ""}</p>
                          {ctrl.has_fichier && (
                            <p className="mt-1 text-xs text-app-dark/40">ðŸ“Ž Énoncé: {ctrl.nom_fichier_enonce}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </article>
                ) : null}
              </>
            ) : null}

            {/* â”€â”€ CONTRÃ”LES â”€â”€ */}
            {stageaireView === "controles" ? (
              <>
                {detailControleId === null ? (
                  <>
                    {/* Stats bar */}
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { label: "Disponibles", value: stageaireData.controls.available_count, color: "#15173D" },
                        { label: "Soumis", value: stageaireData.controls.submitted_count, color: "#22c55e" },
                        { label: "En attente", value: stageaireData.controls.pending_count, color: "#982598" },
                      ].map((s) => (
                        <div key={s.label} className="rounded-2xl border border-app-muted bg-white p-4 text-center shadow-sm">
                          <p className="text-2xl font-black" style={{ color: s.color }}>{s.value}</p>
                          <p className="mt-0.5 text-xs text-app-dark/50">{s.label}</p>
                        </div>
                      ))}
                    </div>

                    <article className="rounded-2xl border border-app-muted bg-white shadow-sm overflow-hidden">
                      <div className="px-6 py-4 border-b border-app-muted/60" style={{ background: "#15173D" }}>
                        <h3 className="font-bold text-white">Contrôles à réaliser</h3>
                        <p className="mt-0.5 text-xs text-white/50">Cliquez sur un contrôle pour le consulter et soumettre votre réponse.</p>
                      </div>
                      <div className="p-5 space-y-3">
                        {stageaireData.controls_list.length > 0 ? stageaireData.controls_list.map((control) => {
                          const submitted = stageaireData.submitted_control_ids.includes(control.id);
                          const isOverdue = !submitted && control.deadline && new Date(control.deadline) < new Date();
                          return (
                            <div
                              key={`control-${control.id}`}
                              className="rounded-xl border p-4 transition"
                              style={{ borderColor: submitted ? "rgba(34,197,94,0.3)" : isOverdue ? "rgba(239,68,68,0.3)" : "rgba(228,145,201,0.5)", background: submitted ? "rgba(34,197,94,0.04)" : isOverdue ? "rgba(239,68,68,0.03)" : "white" }}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex items-center gap-3 min-w-0">
                                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: submitted ? "rgba(34,197,94,0.1)" : "rgba(152,37,152,0.1)" }}>
                                    {submitted ? (
                                      <svg className="h-4 w-4 text-emerald-600" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                    ) : (
                                      <svg className="h-4 w-4 text-app-accent" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                                    )}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="font-semibold text-sm text-app-dark leading-snug">{control.name}</p>
                                    <p className="mt-0.5 text-xs text-app-dark/50 truncate">Cours : {control.cours}</p>
                                  </div>
                                </div>
                                <div className="flex flex-col items-end gap-1.5 shrink-0">
                                  {submitted ? (
                                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">âœ“ Soumis</span>
                                  ) : (
                                    <span className="rounded-full px-2 py-0.5 text-xs font-bold text-white" style={{ background: isOverdue ? "#ef4444" : "#f59e0b" }}>
                                      {isOverdue ? "En retard" : "Ã€ faire"}
                                    </span>
                                  )}
                                  {control.deadline && (
                                    <span className="text-xs" style={{ color: isOverdue ? "#ef4444" : "rgba(21,23,61,0.4)" }}>
                                      {new Date(control.deadline).toLocaleDateString("fr-FR")}
                                    </span>
                                  )}
                                </div>
                              </div>
                              {control.bareme ? <p className="mt-2 text-xs text-app-dark/40">Barème : {control.bareme} pts</p> : null}
                              <button
                                type="button"
                                onClick={() => {
                                  setDetailControleId(control.id);
                                  setDetailControlePdf(null);
                                  if (control.has_fichier_enonce) void loadDetailControlePdf(control.id);
                                }}
                                className="mt-3 w-full rounded-lg px-3 py-2 text-xs font-semibold text-white transition hover:opacity-90"
                                style={{ background: "#15173D" }}
                              >
                                Voir le contrôle â†’
                              </button>
                            </div>
                          );
                        }) : (
                          <div className="flex flex-col items-center gap-3 py-10 text-center">
                            <div className="flex h-14 w-14 items-center justify-center rounded-full" style={{ background: "rgba(21,23,61,0.06)" }}>
                              <svg className="h-7 w-7 text-app-dark/25" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
                            </div>
                            <div>
                              <p className="font-semibold text-app-dark/50">Aucun contrôle disponible</p>
                              <p className="mt-0.5 text-xs text-app-dark/35">Les contrôles assignés à votre classe apparaîtront ici.</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </article>

                    {(stageaireData.soumissions_detail ?? []).length > 0 && (
                      <article className="rounded-2xl border border-app-muted bg-white shadow-sm overflow-hidden">
                        <div className="px-6 py-4 border-b border-app-muted/60" style={{ background: "#15173D" }}>
                          <div className="flex items-center gap-3">
                            <svg className="h-4 w-4 text-white/70" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                            <h3 className="font-bold text-white">Mes réponses</h3>
                          </div>
                          <p className="mt-0.5 text-xs text-white/50">Historique de vos soumissions et résultats.</p>
                        </div>
                        <div className="p-5 space-y-3">
                          {(stageaireData.soumissions_detail ?? []).map((s) => (
                            <div key={s.soumission_id} className="rounded-xl border border-app-muted/60 bg-app-soft/30 p-4 space-y-2">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-semibold text-app-dark leading-snug truncate">{s.controle_name}</p>
                                  <p className="mt-0.5 text-xs text-app-dark/50">
                                    Soumis le {new Date(s.submitted_at).toLocaleDateString("fr-FR")}
                                    {s.has_fichier && (
                                      <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700 font-semibold text-xs">
                                        <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                                        fichier
                                      </span>
                                    )}
                                  </p>
                                </div>
                                <div className="flex flex-col items-end gap-1.5 shrink-0">
                                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${s.statut === "SOUMIS" ? "bg-blue-100 text-blue-700" : s.statut === "RETARD" ? "bg-red-100 text-red-700" : "bg-app-soft text-app-dark/60"}`}>
                                    {s.statut}
                                  </span>
                                  {s.note !== null && (
                                    <span className="rounded-full px-3 py-0.5 text-sm font-black text-white" style={{ background: parseFloat(s.note) >= 10 ? "#22c55e" : "#ef4444" }}>
                                      {s.note}/20
                                    </span>
                                  )}
                                </div>
                              </div>
                              {s.correction_publiee ? (
                                <div className="space-y-2">
                                  <div className="rounded-lg border border-app-muted/60 bg-white p-3">
                                    <p className="text-xs font-semibold text-app-dark/60 mb-1">
                                      {s.correction_titre ? `Correction â€” ${s.correction_titre}` : "Correction officielle"}
                                    </p>
                                    <p className="text-sm text-app-dark/80 whitespace-pre-wrap leading-relaxed">{s.correction_publiee}</p>
                                  </div>
                                  {correctionFichier[s.controle_id] ? (
                                    <div className="rounded-xl border border-app-muted bg-white overflow-hidden">
                                      <div className="flex items-center justify-between px-4 py-2 border-b border-app-muted/60" style={{ background: "#15173D" }}>
                                        <p className="text-xs font-bold text-white">Correction PDF â€” {correctionFichier[s.controle_id]!.name}</p>
                                        <button type="button" onClick={() => setCorrectionFichier((prev) => ({ ...prev, [s.controle_id]: null }))} className="text-white/50 hover:text-white text-xs">âœ• Fermer</button>
                                      </div>
                                      <div className="p-3">
                                        {correctionFichier[s.controle_id]!.mimeType === "application/pdf" || correctionFichier[s.controle_id]!.name.toLowerCase().endsWith(".pdf")
                                          ? <InlinePdfViewer base64={correctionFichier[s.controle_id]!.base64} name={correctionFichier[s.controle_id]!.name} />
                                          : (
                                            <div className="flex items-center gap-3 p-3">
                                              <span className="text-base">ðŸ“Ž</span>
                                              <p className="flex-1 text-sm font-medium text-app-dark">{correctionFichier[s.controle_id]!.name}</p>
                                              <button type="button" className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white" style={{ background: "#982598" }} onClick={() => triggerDownload(correctionFichier[s.controle_id]!.base64, correctionFichier[s.controle_id]!.name, correctionFichier[s.controle_id]!.mimeType)}>↓ Télécharger</button>
                                            </div>
                                          )
                                        }
                                      </div>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      disabled={!!correctionFichierLoading[s.controle_id]}
                                      onClick={() => void loadCorrectionFichier(s.controle_id)}
                                      className="flex items-center gap-2 rounded-lg border border-app-muted bg-white px-3 py-2 text-xs font-semibold text-app-dark transition hover:border-app-accent hover:bg-app-soft disabled:opacity-50"
                                    >
                                      {correctionFichierLoading[s.controle_id] ? (
                                        <svg className="h-4 w-4 animate-spin text-app-accent" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 100 16v-4l-3 3 3 3v-4a8 8 0 01-8-8z" /></svg>
                                      ) : (
                                        <svg className="h-4 w-4 text-app-accent" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                                      )}
                                      {correctionFichierLoading[s.controle_id] ? "Chargementâ€¦" : "Voir la correction PDF"}
                                    </button>
                                  )}
                                </div>
                              ) : (
                                <div className="flex items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2">
                                  <svg className="h-4 w-4 shrink-0 text-orange-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
                                  <p className="text-xs font-semibold text-orange-600">Correction non encore publiée</p>
                                </div>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  setDetailControleId(s.controle_id);
                                  setDetailControlePdf(null);
                                  const ctrl = stageaireData.controls_list.find((c) => c.id === s.controle_id);
                                  if (ctrl?.has_fichier_enonce) void loadDetailControlePdf(s.controle_id);
                                }}
                                className="mt-1 rounded-lg border border-app-muted px-3 py-1.5 text-xs font-semibold text-app-dark/70 transition hover:bg-app-soft"
                              >
                                Voir le contrôle â†’
                              </button>
                            </div>
                          ))}
                        </div>
                      </article>
                    )}

                    {stageaireData.notes.length > 0 && (
                      <article className="rounded-2xl border border-app-muted bg-white shadow-sm overflow-hidden">
                        <div className="px-6 py-4 border-b border-app-muted/60 flex items-center gap-3">
                          <svg className="h-4 w-4 text-emerald-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" /></svg>
                          <h3 className="font-bold text-app-dark">Notes publiées</h3>
                        </div>
                        <div className="p-5 space-y-2">
                          {stageaireData.notes.map((note, index) => (
                            <div key={`${note.controle}-${index}`} className="flex items-center justify-between rounded-xl border border-app-muted/60 bg-app-soft/40 px-4 py-3">
                              <p className="text-sm text-app-dark/80 flex-1 mr-3 truncate">{note.controle}</p>
                              <span className="shrink-0 rounded-full px-3 py-1 text-sm font-black text-white" style={{ background: parseFloat(note.note) >= 10 ? "#22c55e" : "#ef4444" }}>
                                {note.note}/20
                              </span>
                            </div>
                          ))}
                        </div>
                      </article>
                    )}
                  </>
                ) : (() => {
                  const ctrl = stageaireData.controls_list.find((c) => c.id === detailControleId);
                  const soumission = (stageaireData.soumissions_detail ?? []).find((s) => s.controle_id === detailControleId);
                  const submitted = stageaireData.submitted_control_ids.includes(detailControleId);
                  const isOverdue = !submitted && ctrl?.deadline && new Date(ctrl.deadline) < new Date();
                  return (
                    <>
                      {/* Header with back button */}
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => { setDetailControleId(null); setDetailControlePdf(null); setCorrectionFichier(null); }}
                          className="flex items-center gap-1.5 rounded-lg border border-app-muted bg-white px-3 py-2 text-xs font-semibold text-app-dark transition hover:bg-app-soft"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                          Retour
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-app-dark truncate">{ctrl?.name ?? "Contrôle"}</p>
                          {ctrl?.cours && <p className="text-xs text-app-dark/50 truncate">Cours : {ctrl.cours}</p>}
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          {submitted ? (
                            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-700">âœ“ Soumis</span>
                          ) : (
                            <span className="rounded-full px-2.5 py-0.5 text-xs font-bold text-white" style={{ background: isOverdue ? "#ef4444" : "#f59e0b" }}>
                              {isOverdue ? "En retard" : "Ã€ faire"}
                            </span>
                          )}
                          {ctrl?.deadline && (
                            <span className="text-xs" style={{ color: isOverdue ? "#ef4444" : "rgba(21,23,61,0.4)" }}>
                              Limite : {new Date(ctrl.deadline).toLocaleDateString("fr-FR")}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Énoncé section */}
                      <article className="rounded-2xl border border-app-muted bg-white shadow-sm overflow-hidden">
                        <div className="px-6 py-4 border-b border-app-muted/60" style={{ background: "#15173D" }}>
                          <h3 className="font-bold text-white">Énoncé</h3>
                          {ctrl?.bareme ? <p className="mt-0.5 text-xs text-white/50">Barème : {ctrl.bareme} pts</p> : null}
                        </div>
                        <div className="p-5 space-y-4">
                          {ctrl?.enonce ? (
                            <div className="rounded-lg border border-app-muted/60 bg-app-soft/60 p-4">
                              <p className="whitespace-pre-wrap text-sm text-app-dark/80">{ctrl.enonce}</p>
                            </div>
                          ) : null}
                          {detailControlePdfLoading && (
                            <div className="flex items-center gap-2 py-6 justify-center text-app-dark/50">
                              <svg className="h-4 w-4 animate-spin" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 100 16v-4l-3 3 3 3v-4a8 8 0 01-8-8z" /></svg>
                              <span className="text-sm">Chargement du fichier PDFâ€¦</span>
                            </div>
                          )}
                          {detailControlePdf && !detailControlePdfLoading && (
                            detailControlePdf.mimeType === "application/pdf" || detailControlePdf.name.toLowerCase().endsWith(".pdf")
                              ? <InlinePdfViewer base64={detailControlePdf.base64} name={detailControlePdf.name} />
                              : detailControlePdf.name.toLowerCase().endsWith(".docx") || detailControlePdf.name.toLowerCase().endsWith(".doc")
                                ? <InlineDocxViewer base64={detailControlePdf.base64} name={detailControlePdf.name} />
                                : (
                                  <div className="flex items-center gap-3 rounded-xl border border-app-muted bg-white px-4 py-4">
                                    <span className="text-base">ðŸ“Ž</span>
                                    <div className="flex-1">
                                      <p className="text-sm font-semibold text-app-dark">{detailControlePdf.name}</p>
                                      <p className="text-xs text-app-dark/40">Aperçu non disponible pour ce format</p>
                                    </div>
                                    <button
                                      type="button"
                                      className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white"
                                      style={{ background: "#982598" }}
                                      onClick={() => triggerDownload(detailControlePdf.base64, detailControlePdf.name, detailControlePdf.mimeType)}
                                    >
                                      ↓ Télécharger
                                    </button>
                                  </div>
                                )
                          )}
                          {!detailControlePdfLoading && !detailControlePdf && !ctrl?.enonce && (
                            <p className="text-sm italic text-app-dark/40 text-center py-4">Aucun énoncé disponible pour ce contrôle.</p>
                          )}
                        </div>
                      </article>

                      {/* Submit response section */}
                      <article className="rounded-2xl border border-app-muted bg-white shadow-sm overflow-hidden">
                        <div className="px-6 py-4 border-b border-app-muted/60" style={{ background: "#15173D" }}>
                          <h3 className="font-bold text-white">Réponse Contrôle</h3>
                          <p className="mt-0.5 text-xs text-white/50">Soumettez votre réponse en PDF.</p>
                        </div>
                        <div className="p-5 space-y-4">
                          {/* Existing submission info */}
                          {soumission && (
                            <div className="rounded-xl border border-app-muted bg-app-soft/40 p-4 space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-sm font-semibold text-app-dark">Soumission actuelle</p>
                                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${soumission.statut === "SOUMIS" ? "bg-blue-100 text-blue-700" : soumission.statut === "RETARD" ? "bg-red-100 text-red-700" : "bg-app-soft text-app-dark/60"}`}>
                                  {soumission.statut}
                                </span>
                              </div>
                              <p className="text-xs text-app-dark/50">
                                Soumis le {new Date(soumission.submitted_at).toLocaleDateString("fr-FR")}
                                {soumission.has_fichier && (
                                  <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700 font-semibold">
                                    <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                                    fichier joint
                                  </span>
                                )}
                              </p>
                              {soumission.note !== null && (
                                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1">
                                  <svg className="h-3.5 w-3.5 text-emerald-600" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                  <span className="text-sm font-black text-emerald-700">{soumission.note}/20</span>
                                </div>
                              )}
                              {soumission.correction_publiee ? (
                                <div className="space-y-2">
                                  <div className="rounded bg-app-soft p-3">
                                    <p className="text-xs font-semibold text-app-dark/70 mb-1">{soumission.correction_titre ? `Correction â€” ${soumission.correction_titre}` : "Correction officielle"}</p>
                                    <p className="text-sm text-app-dark/80 whitespace-pre-wrap">{soumission.correction_publiee}</p>
                                  </div>
                                  {/* Correction PDF viewer */}
                                  {correctionFichier[soumission.controle_id] ? (
                                    <div className="rounded-xl border border-app-muted bg-white overflow-hidden">
                                      <div className="flex items-center justify-between px-4 py-2 border-b border-app-muted/60" style={{ background: "#15173D" }}>
                                        <p className="text-xs font-bold text-white">Correction PDF â€” {correctionFichier[soumission.controle_id]!.name}</p>
                                        <button type="button" onClick={() => setCorrectionFichier((prev) => ({ ...prev, [soumission.controle_id]: null }))} className="text-white/50 hover:text-white text-xs">âœ• Fermer</button>
                                      </div>
                                      <div className="p-3">
                                        {correctionFichier[soumission.controle_id]!.mimeType === "application/pdf" || correctionFichier[soumission.controle_id]!.name.toLowerCase().endsWith(".pdf")
                                          ? <InlinePdfViewer base64={correctionFichier[soumission.controle_id]!.base64} name={correctionFichier[soumission.controle_id]!.name} />
                                          : (
                                            <div className="flex items-center gap-3 p-3">
                                              <span className="text-base">ðŸ“Ž</span>
                                              <p className="flex-1 text-sm font-medium text-app-dark">{correctionFichier[soumission.controle_id]!.name}</p>
                                              <button type="button" className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white" style={{ background: "#982598" }} onClick={() => triggerDownload(correctionFichier[soumission.controle_id]!.base64, correctionFichier[soumission.controle_id]!.name, correctionFichier[soumission.controle_id]!.mimeType)}>↓ Télécharger</button>
                                            </div>
                                          )
                                        }
                                      </div>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      disabled={!!correctionFichierLoading[soumission.controle_id]}
                                      onClick={() => void loadCorrectionFichier(soumission.controle_id)}
                                      className="flex items-center gap-2 rounded-lg border border-app-muted bg-white px-3 py-2 text-xs font-semibold text-app-dark transition hover:border-app-accent hover:bg-app-soft disabled:opacity-50"
                                    >
                                      {correctionFichierLoading[soumission.controle_id] ? (
                                        <svg className="h-4 w-4 animate-spin text-app-accent" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 100 16v-4l-3 3 3 3v-4a8 8 0 01-8-8z" /></svg>
                                      ) : (
                                        <svg className="h-4 w-4 text-app-accent" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                                      )}
                                      {correctionFichierLoading[soumission.controle_id] ? "Chargementâ€¦" : "Voir la correction PDF"}
                                    </button>
                                  )}
                                </div>
                              ) : (
                                <div className="flex items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2">
                                  <svg className="h-4 w-4 shrink-0 text-orange-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
                                  <p className="text-xs font-semibold text-orange-600">Correction non encore publiée</p>
                                </div>
                              )}
                            </div>
                          )}
                          {/* File upload */}
                          <div className="rounded-xl border border-dashed border-app-muted bg-app-soft/50 p-4">
                            <div className="mb-3 flex items-center gap-2">
                              <svg className="h-4 w-4 text-red-500" fill="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM6 20V4h5v7h7v9H6z"/></svg>
                              <p className="text-sm font-semibold text-app-dark/70">
                                {soumission?.has_fichier ? "Remplacer le fichier PDF" : "Joindre votre réponse en PDF"}
                              </p>
                            </div>
                            <input
                              accept=".pdf,application/pdf"
                              className="block w-full rounded-lg border border-app-muted bg-white px-3 py-2 text-sm text-app-dark file:mr-3 file:rounded file:border-0 file:bg-app-dark file:px-3 file:py-1 file:text-xs file:font-semibold file:text-white"
                              type="file"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) setSubmissionFiles((prev) => ({ ...prev, [detailControleId]: f }));
                              }}
                            />
                            {submissionFiles[detailControleId] && (
                              <p className="mt-1.5 text-xs text-app-dark/60">{submissionFiles[detailControleId].name}</p>
                            )}
                          </div>
                          {actionMessage && (
                            <p className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-sm font-medium text-emerald-700">{actionMessage}</p>
                          )}
                          <button
                            type="button"
                            disabled={!submissionFiles[detailControleId]}
                            onClick={() => void handleSubmitAnswer(detailControleId)}
                            className="w-full rounded-xl px-4 py-3 text-sm font-bold text-white transition disabled:opacity-40"
                            style={{ background: "#982598" }}
                          >
                            {soumission?.has_fichier ? "Remplacer ma réponse" : "Soumettre ma réponse"}
                          </button>
                        </div>
                      </article>
                    </>
                  );
                })()}
              </>
            ) : null}

            {/* â”€â”€ SUJET FIN DE STAGE â”€â”€ */}
            {stageaireView === "sujet" ? (
              <article className="rounded-2xl border border-app-muted bg-white shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-app-muted/60" style={{ background: "#15173D" }}>
                  <h3 className="font-bold text-white">Sujet de fin de stage</h3>
                  <p className="mt-0.5 text-xs text-white/50">Votre sujet de recherche et encadrant assigné.</p>
                </div>
                <div className="p-6">
                  {stageaireData.sujet_fin_stage ? (
                    <div className="space-y-4">
                      {/* Status badge */}
                      <div className="flex items-center gap-3">
                        <span className="rounded-full px-3 py-1 text-xs font-bold text-white" style={{ background: stageaireData.sujet_fin_stage.etat === "EN_COURS" ? "#982598" : stageaireData.sujet_fin_stage.etat === "TERMINE" ? "#22c55e" : "#ef4444" }}>
                          {stageaireData.sujet_fin_stage.etat.replace("_", " ")}
                        </span>
                        {stageaireData.sujet_fin_stage.date_affectation && (
                          <span className="text-xs text-app-dark/40">Affecté le {new Date(stageaireData.sujet_fin_stage.date_affectation).toLocaleDateString("fr-FR")}</span>
                        )}
                      </div>
                      {/* Title */}
                      <div className="rounded-xl border border-app-muted/60 bg-app-soft/50 p-5">
                        <p className="text-lg font-bold text-app-dark">{stageaireData.sujet_fin_stage.titre}</p>
                        {stageaireData.sujet_fin_stage.description && (
                          <p className="mt-3 text-sm text-app-dark/70 whitespace-pre-wrap leading-relaxed">{stageaireData.sujet_fin_stage.description}</p>
                        )}
                      </div>
                      {/* Encadrant */}
                      <div className="flex items-center gap-3 rounded-xl border border-app-muted/60 bg-white px-4 py-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white" style={{ background: "#15173D" }}>
                          {stageaireData.sujet_fin_stage.encadrant.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-xs text-app-dark/40">Encadrant</p>
                          <p className="font-semibold text-app-dark">{stageaireData.sujet_fin_stage.encadrant}</p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-4 py-12 text-center">
                      <div className="flex h-16 w-16 items-center justify-center rounded-full" style={{ background: "rgba(21,23,61,0.06)" }}>
                        <svg className="h-8 w-8 text-app-dark/25" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                      </div>
                      <div>
                        <p className="font-semibold text-app-dark/50">Aucun sujet affecté</p>
                        <p className="mt-1 text-xs text-app-dark/35 max-w-xs">Votre sujet de fin de stage apparaîtra ici une fois qu'un encadrant vous l'aura assigné.</p>
                      </div>
                    </div>
                  )}
                </div>
              </article>
            ) : null}

            {/* â”€â”€ INSTALLATION & LOGICIELS â”€â”€ */}
            {stageaireView === "installation_logiciels" ? (
              <article className="rounded-2xl border border-app-muted bg-white shadow-sm overflow-hidden">
                <div className="flex items-center justify-between border-b border-app-muted px-6 py-4" style={{ background: "#15173D" }}>
                  <div>
                    <h3 className="font-bold text-white">Installation & Logiciels</h3>
                    <p className="mt-0.5 text-xs text-white/50">Fichiers partagés par vos instructeurs.</p>
                  </div>
                  <button type="button" onClick={() => void loadInstallFichiers()} className="flex items-center gap-1 rounded-lg border border-white/20 px-2.5 py-1 text-xs font-semibold text-white/80 hover:bg-white/10 transition">
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                    Actualiser
                  </button>
                </div>
                <div className="divide-y divide-app-muted/40">
                  {installFichiers.length === 0 ? (
                    <div className="flex flex-col items-center gap-3 py-12 text-center">
                      <svg className="h-10 w-10 text-app-dark/15" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                      <p className="text-sm text-app-dark/40">Aucun fichier partagé pour le moment.</p>
                    </div>
                  ) : installFichiers.map((f) => (
                    <div key={f.id} className="flex items-center gap-4 px-5 py-3">
                      <svg className="h-8 w-8 shrink-0 text-blue-500" fill="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM6 20V4h5v7h7v9H6z"/></svg>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-app-dark truncate">{f.titre}</p>
                        <p className="text-xs text-app-dark/40">{f.nom_fichier} Â· {new Date(f.uploaded_at).toLocaleDateString("fr-FR")}</p>
                      </div>
                      <button type="button" onClick={() => void handleInstallDownload(f.id, f.nom_fichier)} className="flex items-center gap-1.5 rounded-lg border border-app-muted bg-app-soft px-3 py-1.5 text-xs font-semibold text-app-dark transition hover:bg-white shrink-0">
                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                        Télécharger
                      </button>
                    </div>
                  ))}
                </div>
              </article>
            ) : null}

            {/* â”€â”€ FEUILLE DE RÉDACTION â”€â”€ */}
            {stageaireView === "feuille_redaction" ? (
              <article className="rounded-2xl border border-app-muted bg-white shadow-sm overflow-hidden">
                <div className="flex items-center justify-between border-b border-app-muted px-6 py-4" style={{ background: "#15173D" }}>
                  <div>
                    <h3 className="font-bold text-white">Feuille de rédaction</h3>
                    <p className="mt-0.5 text-xs text-white/50">Fichiers partagés par l'administration.</p>
                  </div>
                  <button type="button" onClick={() => void loadFeuilleRFichiers()} className="flex items-center gap-1 rounded-lg border border-white/20 px-2.5 py-1 text-xs font-semibold text-white/80 hover:bg-white/10 transition">
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                    Actualiser
                  </button>
                </div>
                <div className="divide-y divide-app-muted/40">
                  {feuilleRFichiers.length === 0 ? (
                    <div className="flex flex-col items-center gap-3 py-12 text-center">
                      <svg className="h-10 w-10 text-app-dark/15" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                      <p className="text-sm text-app-dark/40">Aucune feuille de rédaction disponible pour le moment.</p>
                    </div>
                  ) : feuilleRFichiers.map((f) => (
                    <div key={f.id} className="flex items-center gap-4 px-5 py-3">
                      {f.nom_fichier.toLowerCase().endsWith(".pdf") ? (
                        <svg className="h-8 w-8 shrink-0 text-red-500" fill="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM6 20V4h5v7h7v9H6z"/><text x="6" y="17" fontSize="5" fill="white" fontWeight="bold">PDF</text></svg>
                      ) : (
                        <svg className="h-8 w-8 shrink-0 text-blue-500" fill="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM6 20V4h5v7h7v9H6z"/></svg>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-app-dark truncate">{f.titre}</p>
                        <p className="text-xs text-app-dark/40">{f.nom_fichier} Â· {new Date(f.uploaded_at).toLocaleDateString("fr-FR")}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {f.nom_fichier.toLowerCase().endsWith(".pdf") && (
                          <button type="button" onClick={() => void handleFeuilleRView(f.id, f.nom_fichier)} className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-100">
                            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                            Voir
                          </button>
                        )}
                        <button type="button" onClick={() => void handleFeuilleRDownload(f.id, f.nom_fichier)} className="flex items-center gap-1.5 rounded-lg border border-app-muted bg-app-soft px-3 py-1.5 text-xs font-semibold text-app-dark transition hover:bg-white">
                          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                          Télécharger
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            ) : null}


          </div>
        </section>
      ) : null}

      {user.role === "Coordinateur" && coordinateurData ? (
        <section className="mt-6 grid gap-5 md:grid-cols-[220px_1fr]">
          {/* Sidebar */}
          <aside className="sidebar-animated card-hover rounded-2xl border border-app-muted bg-white p-4 shadow-sm self-start">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-app-accent">Espace Coordinateur</p>
            <div className="mt-3 grid gap-1">
              {([
                { key: "dashboard", label: "Tableau de bord", icon: <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /> },
                { key: "reporting", label: "Reporting", icon: <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /> },
                { key: "export", label: "Export données", icon: <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /> },
              ] as const).map(({ key, label, icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setCoordinateurView(key)}
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${coordinateurView === key ? "bg-app-dark text-white" : "text-app-dark hover:bg-app-soft"}`}
                >
                  <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={coordinateurView === key ? 2.5 : 2} viewBox="0 0 24 24">{icon}</svg>
                  {label}
                </button>
              ))}
            </div>

            {/* Notification badge in sidebar */}
            {coordinateurData.notifications.unread_count > 0 && (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 flex items-center gap-2">
                <svg className="h-3.5 w-3.5 shrink-0 text-amber-500" fill="currentColor" viewBox="0 0 24 24"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9m-4.27 13a2 2 0 01-3.46 0" /></svg>
                <p className="text-xs font-semibold text-amber-700">{coordinateurData.notifications.unread_count} non lue{coordinateurData.notifications.unread_count > 1 ? "s" : ""}</p>
              </div>
            )}

            {/* Quick actions */}
            <div className="mt-5 border-t border-app-muted/60 pt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-app-dark/40">Actions rapides</p>
              <div className="grid gap-1.5">
                <button
                  type="button"
                  onClick={() => setCoordinateurView("reporting")}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-app-dark hover:bg-app-soft transition text-left"
                >
                  <svg className="h-3.5 w-3.5 shrink-0 text-app-accent" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                  Voir les performances
                </button>
                <button
                  type="button"
                  onClick={() => void handleExportCSV()}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-app-dark hover:bg-app-soft transition text-left"
                >
                  <svg className="h-3.5 w-3.5 shrink-0 text-app-accent" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  Exporter CSV
                </button>
                <button
                  type="button"
                  onClick={() => void handleExportXLSX()}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-app-dark hover:bg-app-soft transition text-left"
                >
                  <svg className="h-3.5 w-3.5 shrink-0 text-emerald-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                  Exporter Excel
                </button>
              </div>
            </div>
          </aside>

          {/* Main content */}
          <div className="min-w-0 grid gap-5">

            {/* â”€â”€ NOTIFICATION FLASH â”€â”€ */}
            {coordinateurData.notifications.unread_count > 0 && !coordNotifDismissed && (
              <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 shadow-sm animate-pulse-once">
                <svg className="h-5 w-5 shrink-0 text-amber-500 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-amber-800">
                    {coordinateurData.notifications.unread_count} notification{coordinateurData.notifications.unread_count > 1 ? "s" : ""} non lue{coordinateurData.notifications.unread_count > 1 ? "s" : ""}
                  </p>
                  <p className="mt-0.5 text-xs text-amber-700/70">Consultez vos notifications pour rester informé des activités récentes.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setCoordNotifDismissed(true)}
                  className="shrink-0 rounded-lg p-1 text-amber-500 transition hover:bg-amber-100"
                  title="Fermer"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            )}

            {/* â”€â”€ DASHBOARD â”€â”€ */}
            {coordinateurView === "dashboard" && (
              <>
                {/* KPI cards */}
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  {[
                    { label: "Brigades", value: coordinateurData.monitoring.brigades.length, color: "#15173D", bg: "rgba(21,23,61,0.07)", icon: <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /> },
                    { label: "Stagiaires", value: coordinateurData.monitoring.stagiaires_total, color: "#15173D", bg: "rgba(21,23,61,0.07)", icon: <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /> },
                    { label: "Contrôles publiés", value: coordinateurData.monitoring.controls_published, color: "#982598", bg: "rgba(152,37,152,0.07)", icon: <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /> },
                    { label: "Notes publiées", value: coordinateurData.monitoring.notes_published, color: "#059669", bg: "rgba(5,150,105,0.07)", icon: <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" /> },
                  ].map((s) => (
                    <article key={s.label} className="rounded-2xl border border-app-muted bg-white p-4 shadow-sm">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: s.bg }}>
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{ color: s.color }}>{s.icon}</svg>
                        </div>
                      </div>
                      <p className="text-2xl font-black" style={{ color: s.color }}>{s.value}</p>
                      <p className="mt-0.5 text-xs font-semibold text-app-dark/50 uppercase tracking-wide">{s.label}</p>
                    </article>
                  ))}
                </div>

                {/* Performance mini-chart strip */}
                <article className="rounded-2xl border border-app-muted bg-white shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-app-muted/60 flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-app-dark">Performance globale</h3>
                      <p className="mt-0.5 text-xs text-app-dark/50">Indicateurs clés en temps réel</p>
                    </div>
                    <button type="button" onClick={() => setCoordinateurView("reporting")} className="text-xs font-semibold text-app-accent hover:underline">Voir le détail â†’</button>
                  </div>
                  <div className="grid grid-cols-3 divide-x divide-app-muted/40 p-0">
                    {[
                      {
                        label: "Taux de réussite",
                        value: coordinateurData.monitoring.taux_reussite_global !== null ? `${coordinateurData.monitoring.taux_reussite_global}%` : "â€”",
                        pct: coordinateurData.monitoring.taux_reussite_global ?? 0,
                        color: (coordinateurData.monitoring.taux_reussite_global ?? 0) >= 50 ? "#059669" : "#f59e0b",
                        sub: "stagiaires â‰¥ 10/20",
                      },
                      {
                        label: "Note moyenne",
                        value: coordinateurData.monitoring.avancement_moyen !== null ? `${coordinateurData.monitoring.avancement_moyen}/20` : "â€”",
                        pct: ((coordinateurData.monitoring.avancement_moyen ?? 0) / 20) * 100,
                        color: (coordinateurData.monitoring.avancement_moyen ?? 0) >= 10 ? "#059669" : "#ef4444",
                        sub: "moyenne générale",
                      },
                      {
                        label: "Évalués",
                        value: `${coordinateurData.monitoring.brigades.reduce((s, b) => s + b.avec_notes_count, 0)}/${coordinateurData.monitoring.stagiaires_total}`,
                        pct: coordinateurData.monitoring.stagiaires_total > 0 ? (coordinateurData.monitoring.brigades.reduce((s, b) => s + b.avec_notes_count, 0) / coordinateurData.monitoring.stagiaires_total) * 100 : 0,
                        color: "#982598",
                        sub: "stagiaires notés",
                      },
                    ].map((kpi) => (
                      <div key={kpi.label} className="flex flex-col gap-2 p-5">
                        <p className="text-xs font-semibold uppercase tracking-wider text-app-dark/40">{kpi.label}</p>
                        <p className="text-2xl font-black" style={{ color: kpi.color }}>{kpi.value}</p>
                        <div className="h-1.5 w-full rounded-full bg-app-muted/30 overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(kpi.pct, 100)}%`, background: kpi.color }} />
                        </div>
                        <p className="text-xs text-app-dark/35">{kpi.sub}</p>
                      </div>
                    ))}
                  </div>
                </article>

                {/* Brigade table with search + filters */}
                <article className="rounded-2xl border border-app-muted bg-white shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-app-muted/60" style={{ background: "#15173D" }}>
                    <h3 className="font-bold text-white">Vue par brigade</h3>
                    <p className="mt-0.5 text-xs text-white/50">Détail par brigade sous votre responsabilité.</p>
                  </div>

                  {/* Search + filter bar */}
                  <div className="flex flex-wrap items-center gap-3 border-b border-app-muted/40 bg-app-soft/30 px-5 py-3">
                    {/* Search */}
                    <div className="relative flex-1 min-w-[160px]">
                      <svg className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-app-dark/30" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                      <input
                        type="text"
                        placeholder="Rechercher une brigadeâ€¦"
                        value={brigadeSearch}
                        onChange={(e) => setBrigadeSearch(e.target.value)}
                        className="w-full rounded-lg border border-app-muted bg-white py-1.5 pl-8 pr-3 text-sm text-app-dark placeholder-app-dark/30 focus:outline-none focus:ring-1 focus:ring-app-accent"
                      />
                    </div>
                    {/* Dynamic filters */}
                    <div className="flex gap-1.5 flex-wrap">
                      {([
                        { key: "tous", label: "Toutes" },
                        { key: "reussite", label: "En réussite â‰¥70%" },
                        { key: "surveiller", label: "Ã€ surveiller <50%" },
                        { key: "sans_notes", label: "Sans notes" },
                      ] as const).map((f) => (
                        <button
                          key={f.key}
                          type="button"
                          onClick={() => setBrigadeFilter(f.key)}
                          className="rounded-full px-3 py-1 text-xs font-semibold transition"
                          style={{
                            background: brigadeFilter === f.key ? "#15173D" : "rgba(21,23,61,0.06)",
                            color: brigadeFilter === f.key ? "white" : "#15173D",
                          }}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    {(() => {
                      const filtered = coordinateurData.monitoring.brigades.filter((b) => {
                        const matchSearch = b.brigade_code.toLowerCase().includes(brigadeSearch.toLowerCase());
                        const matchFilter =
                          brigadeFilter === "tous" ? true :
                          brigadeFilter === "reussite" ? (b.taux_reussite !== null && b.taux_reussite >= 70) :
                          brigadeFilter === "surveiller" ? (b.taux_reussite === null || b.taux_reussite < 50) :
                          brigadeFilter === "sans_notes" ? b.published_notes_count === 0 :
                          true;
                        return matchSearch && matchFilter;
                      });
                      return (
                        <table className="min-w-full text-sm">
                          <thead>
                            <tr className="border-b border-app-muted/60 bg-app-soft/40">
                              {["Brigade", "Classes", "Stagiaires", "Notes publiées", "Moyenne /20", "Taux réussite", "Soumissions"].map((h) => (
                                <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-app-dark/50">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {filtered.map((b) => (
                              <tr className="border-b border-app-muted/40 hover:bg-app-soft/30 transition" key={b.brigade_code}>
                                <td className="px-4 py-3 font-semibold text-app-dark">{b.brigade_code}</td>
                                <td className="px-4 py-3 text-app-dark/70">{b.classes_count}</td>
                                <td className="px-4 py-3 text-app-dark/70">{b.stagiaires_count}</td>
                                <td className="px-4 py-3 text-app-dark/70">{b.published_notes_count}</td>
                                <td className="px-4 py-3">
                                  {b.note_moyenne !== null ? (
                                    <span className="font-bold" style={{ color: b.note_moyenne >= 10 ? "#059669" : "#ef4444" }}>{b.note_moyenne}/20</span>
                                  ) : <span className="text-app-dark/30">â€”</span>}
                                </td>
                                <td className="px-4 py-3">
                                  {b.taux_reussite !== null ? (
                                    <div className="flex items-center gap-2">
                                      <div className="h-1.5 w-16 rounded-full bg-app-muted/30 overflow-hidden">
                                        <div className="h-full rounded-full" style={{ width: `${b.taux_reussite}%`, background: b.taux_reussite >= 70 ? "#059669" : b.taux_reussite >= 50 ? "#f59e0b" : "#ef4444" }} />
                                      </div>
                                      <span className="font-bold text-xs" style={{ color: b.taux_reussite >= 70 ? "#059669" : b.taux_reussite >= 50 ? "#f59e0b" : "#ef4444" }}>{b.taux_reussite}%</span>
                                    </div>
                                  ) : <span className="text-app-dark/30">â€”</span>}
                                </td>
                                <td className="px-4 py-3 text-app-dark/70">{b.soumissions_count}</td>
                              </tr>
                            ))}
                            {filtered.length === 0 && (
                              <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-app-dark/40 italic">Aucune brigade ne correspond aux critères.</td></tr>
                            )}
                          </tbody>
                        </table>
                      );
                    })()}
                  </div>
                </article>
              </>
            )}

            {/* â”€â”€ REPORTING â”€â”€ */}
            {coordinateurView === "reporting" && (
              <>
                {/* Global KPI */}
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <article className="rounded-2xl border border-app-muted bg-white p-5 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-wider text-app-dark/40">Taux de réussite global</p>
                    <div className="mt-3 flex items-end gap-2">
                      <span className="text-4xl font-black" style={{ color: (coordinateurData.monitoring.taux_reussite_global ?? 0) >= 50 ? "#059669" : "#f59e0b" }}>
                        {coordinateurData.monitoring.taux_reussite_global !== null ? `${coordinateurData.monitoring.taux_reussite_global}%` : "â€”"}
                      </span>
                      <span className="mb-1 text-xs text-app-dark/40">stagiaires â‰¥ 10/20</span>
                    </div>
                    <div className="mt-3 h-2 w-full rounded-full bg-app-muted/40 overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${coordinateurData.monitoring.taux_reussite_global ?? 0}%`, background: (coordinateurData.monitoring.taux_reussite_global ?? 0) >= 50 ? "#059669" : "#f59e0b" }} />
                    </div>
                  </article>
                  <article className="rounded-2xl border border-app-muted bg-white p-5 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-wider text-app-dark/40">Avancement moyen</p>
                    <div className="mt-3 flex items-end gap-2">
                      <span className="text-4xl font-black" style={{ color: (coordinateurData.monitoring.avancement_moyen ?? 0) >= 10 ? "#059669" : "#ef4444" }}>
                        {coordinateurData.monitoring.avancement_moyen !== null ? `${coordinateurData.monitoring.avancement_moyen}` : "â€”"}
                      </span>
                      <span className="mb-1 text-xs text-app-dark/40">/ 20</span>
                    </div>
                    <div className="mt-3 h-2 w-full rounded-full bg-app-muted/40 overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${((coordinateurData.monitoring.avancement_moyen ?? 0) / 20) * 100}%`, background: (coordinateurData.monitoring.avancement_moyen ?? 0) >= 10 ? "#059669" : "#ef4444" }} />
                    </div>
                  </article>
                  <article className="rounded-2xl border border-app-muted bg-white p-5 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-wider text-app-dark/40">Stagiaires évalués</p>
                    <div className="mt-3 flex items-end gap-2">
                      <span className="text-4xl font-black text-app-dark">
                        {coordinateurData.monitoring.brigades.reduce((s, b) => s + b.avec_notes_count, 0)}
                      </span>
                      <span className="mb-1 text-xs text-app-dark/40">/ {coordinateurData.monitoring.stagiaires_total}</span>
                    </div>
                    <div className="mt-3 h-2 w-full rounded-full bg-app-muted/40 overflow-hidden">
                      <div className="h-full rounded-full bg-app-accent transition-all" style={{ width: coordinateurData.monitoring.stagiaires_total > 0 ? `${(coordinateurData.monitoring.brigades.reduce((s, b) => s + b.avec_notes_count, 0) / coordinateurData.monitoring.stagiaires_total) * 100}%` : "0%" }} />
                    </div>
                  </article>
                </div>

                {/* Taux de réussite per brigade */}
                <article className="rounded-2xl border border-app-muted bg-white shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-app-muted/60">
                    <h3 className="font-bold text-app-dark">Taux de réussite par brigade</h3>
                    <p className="mt-0.5 text-xs text-app-dark/50">% de stagiaires avec une moyenne â‰¥ 10/20</p>
                  </div>
                  <div className="p-5 space-y-4">
                    {coordinateurData.monitoring.brigades.length === 0 ? (
                      <p className="text-sm text-app-dark/40 italic text-center py-6">Aucune brigade disponible.</p>
                    ) : coordinateurData.monitoring.brigades.map((b) => {
                      const taux = b.taux_reussite ?? 0;
                      const color = taux >= 70 ? "#059669" : taux >= 50 ? "#f59e0b" : "#ef4444";
                      return (
                        <div key={b.brigade_code}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-semibold text-app-dark">{b.brigade_code}</span>
                            <span className="text-sm font-bold" style={{ color }}>{b.taux_reussite !== null ? `${b.taux_reussite}%` : "â€”"}</span>
                          </div>
                          <div className="h-3 w-full rounded-full bg-app-muted/40 overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${taux}%`, background: color }} />
                          </div>
                          <p className="mt-0.5 text-xs text-app-dark/40">{b.avec_notes_count} évalués sur {b.stagiaires_count} stagiaires</p>
                        </div>
                      );
                    })}
                  </div>
                </article>

                {/* Avancement moyen per brigade */}
                <article className="rounded-2xl border border-app-muted bg-white shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-app-muted/60">
                    <h3 className="font-bold text-app-dark">Note moyenne par brigade</h3>
                    <p className="mt-0.5 text-xs text-app-dark/50">Moyenne des notes publiées (/20)</p>
                  </div>
                  <div className="p-5 space-y-4">
                    {coordinateurData.monitoring.brigades.length === 0 ? (
                      <p className="text-sm text-app-dark/40 italic text-center py-6">Aucune brigade disponible.</p>
                    ) : coordinateurData.monitoring.brigades.map((b) => {
                      const avg = b.note_moyenne ?? 0;
                      const pct = (avg / 20) * 100;
                      const color = avg >= 14 ? "#059669" : avg >= 10 ? "#f59e0b" : avg > 0 ? "#ef4444" : "#9ca3af";
                      return (
                        <div key={b.brigade_code}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-semibold text-app-dark">{b.brigade_code}</span>
                            <span className="text-sm font-bold" style={{ color }}>{b.note_moyenne !== null ? `${b.note_moyenne}/20` : "â€”"}</span>
                          </div>
                          <div className="h-3 w-full rounded-full bg-app-muted/40 overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
                          </div>
                          <p className="mt-0.5 text-xs text-app-dark/40">{b.published_notes_count} note{b.published_notes_count !== 1 ? "s" : ""} publiée{b.published_notes_count !== 1 ? "s" : ""}</p>
                        </div>
                      );
                    })}
                  </div>
                </article>
              </>
            )}

            {/* â”€â”€ EXPORT â”€â”€ */}
            {coordinateurView === "export" && (
              <article className="rounded-2xl border border-app-muted bg-white shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-app-muted/60" style={{ background: "#15173D" }}>
                  <h3 className="font-bold text-white">Export de données</h3>
                  <p className="mt-0.5 text-xs text-white/50">Générer un rapport complet au format CSV ou Excel.</p>
                </div>
                <div className="p-6 space-y-6">
                  <div className="rounded-xl border border-app-muted/60 bg-app-soft/40 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-app-dark/40 mb-2">Contenu du rapport</p>
                    <ul className="space-y-1 text-sm text-app-dark/70">
                      {["Brigade, classes, stagiaires par brigade", "Nombre de notes publiées et stagiaires évalués", "Note moyenne sur 20 par brigade", "Taux de réussite (â‰¥ 10/20) par brigade", "Nombre total de soumissions par brigade"].map((item) => (
                        <li key={item} className="flex items-center gap-2">
                          <svg className="h-3.5 w-3.5 shrink-0 text-emerald-500" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => void handleExportCSV()}
                      className="flex items-center justify-center gap-3 rounded-xl border-2 border-app-dark bg-white px-5 py-4 text-sm font-semibold text-app-dark transition hover:bg-app-dark hover:text-white"
                    >
                      <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                      <span>Exporter CSV</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleExportXLSX()}
                      className="flex items-center justify-center gap-3 rounded-xl border-2 border-emerald-600 bg-white px-5 py-4 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-600 hover:text-white"
                    >
                      <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                      <span>Exporter Excel (.xlsx)</span>
                    </button>
                  </div>

                  <p className="text-xs text-app-dark/35 text-center">Le rapport inclut les données de toutes les brigades au moment du téléchargement.</p>
                </div>
              </article>
            )}
          </div>
        </section>
      ) : null}

      {user.role === "Admin" && adminData ? (
        <section className="mt-6 grid gap-5 md:grid-cols-[220px_1fr]">
          <aside className="sidebar-animated card-hover rounded-2xl border border-app-muted bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-app-accent">{t("admin.panelTitle")}</p>
            <div className="mt-3 grid gap-1">
              <AdminNavButton active={adminView === "overview"} onClick={() => { setAdminView("overview"); setSelectedAdminUser(null); }}>
                {t("admin.navOverview")}
              </AdminNavButton>

              {/* Users â€” collapsible */}
              <div>
                <button
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition ${adminView === "users" ? "bg-app-dark text-white" : "border border-app-dark text-app-dark hover:bg-app-soft"}`}
                  onClick={() => {
                    setAdminUsersExpanded((v) => !v);
                    setAdminView("users");
                    setSelectedAdminUser(null);
                    setAdminUserRoleFilter(null);
                    setAdminUsersPage(1);
                  }}
                  type="button"
                >
                  <span>{t("admin.navUsers")}</span>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className={`h-3.5 w-3.5 transition-transform ${adminUsersExpanded ? "rotate-180" : ""}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {adminUsersExpanded && (
                  <div className="ml-3 mt-1 grid gap-0.5 border-l-2 border-app-muted pl-3">
                    {(["Stagiaire", "Instructeur", "Coordinateur", "Admin"] as const).map((role) => {
                      const count = adminData.users.filter((u) => u.role === role).length;
                      const isActive = adminView === "users" && adminUserRoleFilter === role;
                      return (
                        <button
                          key={role}
                          className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs font-medium transition ${isActive ? "bg-app-dark text-white" : "text-app-dark/70 hover:bg-app-soft"}`}
                          onClick={() => {
                            setAdminView("users");
                            setSelectedAdminUser(null);
                            setAdminUserRoleFilter(role);
                            setAdminUsersPage(1);
                          }}
                          type="button"
                        >
                          <span>{role}s</span>
                          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${isActive ? "bg-white/20 text-white" : "bg-app-muted text-app-dark/60"}`}>
                            {count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <AdminNavButton active={adminView === "modules"} onClick={() => { setAdminView("modules"); setAdminSelectedModule(null); setSelectedAdminUser(null); }}>
                Modules
              </AdminNavButton>

              <AdminNavButton active={adminView === "accounts"} onClick={() => { setAdminView("accounts"); setSelectedAdminUser(null); }}>
                {t("admin.navAccounts")}
              </AdminNavButton>
              <AdminNavButton active={adminView === "bulk_csv"} onClick={() => { setAdminView("bulk_csv"); setSelectedAdminUser(null); }}>
                Sujets fin stage
              </AdminNavButton>

              <AdminNavButton active={adminView === "references"} onClick={() => { setAdminView("references"); setSelectedAdminUser(null); }}>
                References
              </AdminNavButton>
              <AdminNavButton active={adminView === "events"} onClick={() => { setAdminView("events"); setSelectedAdminUser(null); }}>
                Events
              </AdminNavButton>
              <AdminNavButton active={adminView === "classement"} onClick={() => { setAdminView("classement"); setSelectedAdminUser(null); }}>
                Classement
              </AdminNavButton>
              <AdminNavButton active={adminView === "fichiers_renseignement"} onClick={() => { setAdminView("fichiers_renseignement"); setSelectedAdminUser(null); }}>
                Fichiers de renseignement
              </AdminNavButton>
              <AdminNavButton active={adminView === "feuille_redaction"} onClick={() => { setAdminView("feuille_redaction"); setSelectedAdminUser(null); void loadFeuilleRFichiers(); }}>
                Feuille de rédaction
              </AdminNavButton>
            </div>
          </aside>

          <article className="card-hover rounded-2xl border border-app-muted bg-white p-6 shadow-sm">
            {adminView === "overview" ? (
              <div className="grid gap-5">
                <PanelSection title="Gestion de la plateforme">
                  <AdminPlatformChart platform={{ ...adminData.platform, users_total: adminData.users.filter(u => u.role === "Stagiaire").length }} />
                </PanelSection>

                {/* â”€â”€ Statistiques rapides par rôle â”€â”€ */}
                <PanelSection title="Statistiques rapides par rôle">
                  <AdminRoleChart
                    users={adminData.users}
                    onRoleClick={(role) => { setAdminView("users"); setSelectedAdminUser(null); setAdminUserRoleFilter(role); setAdminUsersExpanded(true); setAdminUsersPage(1); }}
                  />
                </PanelSection>
              </div>
            ) : null}

            {adminView === "users" && !selectedAdminUser ? (
              <PanelSection title="Utilisateurs">

                {/* â”€â”€ Refresh bar â”€â”€ */}
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-app-dark/40">{adminData.users.length} compte(s) au total</p>
                  <button
                    type="button"
                    onClick={() => void reloadAdminData()}
                    disabled={adminRefreshing}
                    className="flex items-center gap-1.5 rounded-lg border border-app-muted bg-white px-3 py-1.5 text-xs font-semibold text-app-dark transition hover:bg-app-soft disabled:opacity-50"
                  >
                    <svg className={`h-3.5 w-3.5 ${adminRefreshing ? "animate-spin" : ""}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    {adminRefreshing ? "Actualisationâ€¦" : "Actualiser"}
                  </button>
                </div>

                {/* â”€â”€ Actions de masse â”€â”€ */}
                <div className="mt-3 rounded-xl border border-app-muted bg-app-soft px-4 py-3">
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-app-dark/50">Actions de masse</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="rounded-lg border border-app-muted bg-white px-3 py-1.5 text-xs font-semibold text-app-dark transition hover:bg-green-50 hover:border-green-300 hover:text-green-700"
                      onClick={async () => {
                        const targets = adminData.users.filter((u) => !u.is_active && (!adminUserRoleFilter || u.role === adminUserRoleFilter));
                        await Promise.all(targets.map((u) => apiFetch(`/api/admin/users/${u.id}/toggle-active/`, { method: "POST" })));
                        await loadDashboard();
                      }}
                    >
                      âœ“ Activer tous {adminUserRoleFilter ? `les ${adminUserRoleFilter}s` : ""}
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-app-muted bg-white px-3 py-1.5 text-xs font-semibold text-app-dark transition hover:bg-red-50 hover:border-red-300 hover:text-red-700"
                      onClick={async () => {
                        const targets = adminData.users.filter((u) => u.is_active && u.id !== user.id && (!adminUserRoleFilter || u.role === adminUserRoleFilter));
                        await Promise.all(targets.map((u) => apiFetch(`/api/admin/users/${u.id}/toggle-active/`, { method: "POST" })));
                        await loadDashboard();
                      }}
                    >
                      âœ• Désactiver tous {adminUserRoleFilter ? `les ${adminUserRoleFilter}s` : ""}
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-app-muted bg-white px-3 py-1.5 text-xs font-semibold text-app-dark transition hover:bg-app-soft"
                      onClick={() => {
                        const rows = adminData.users
                          .filter((u) => !adminUserRoleFilter || u.role === adminUserRoleFilter)
                          .map((u) => `${u.username},${u.email ?? ""},${u.role},${u.is_active ? "Actif" : "Inactif"}`);
                        const csv = ["Username,Email,Role,Statut", ...rows].join("\n");
                        const blob = new Blob([csv], { type: "text/csv" });
                        const a = document.createElement("a");
                        a.href = URL.createObjectURL(blob);
                        a.download = `utilisateurs${adminUserRoleFilter ? `_${adminUserRoleFilter}` : ""}.csv`;
                        a.click();
                      }}
                    >
                      ↓ Exporter CSV
                    </button>
                  </div>
                </div>

                {/* Search */}
                <div className="mt-3 flex items-center gap-2 rounded-lg border border-app-muted bg-app-soft px-3 py-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0 text-app-dark/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                  </svg>
                  <input
                    className="w-full bg-transparent text-sm outline-none placeholder:text-app-dark/40"
                    placeholder="Rechercher par username, email ou rôleâ€¦"
                    value={adminUserSearch}
                    onChange={(e) => { setAdminUserSearch(e.target.value); setAdminUsersPage(1); }}
                  />
                  {adminUserSearch ? (
                    <button className="text-app-dark/40 hover:text-app-dark" onClick={() => { setAdminUserSearch(""); setAdminUsersPage(1); }} type="button">âœ•</button>
                  ) : null}
                </div>

                {/* â”€â”€ Filtres avancés â”€â”€ */}
                <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-app-muted bg-app-soft px-4 py-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-app-dark/50">Filtres avancés</p>
                  {/* Status filter */}
                  <div className="flex items-center gap-1 rounded-lg border border-app-muted bg-white p-0.5">
                    {(["tous", "actif", "inactif"] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        className={`rounded px-3 py-1 text-xs font-semibold transition ${adminStatusFilter === s ? "text-white" : "text-app-dark/60 hover:bg-app-soft"}`}
                        style={adminStatusFilter === s ? { background: "#15173D" } : {}}
                        onClick={() => { setAdminStatusFilter(s); setAdminUsersPage(1); }}
                      >
                        {s === "tous" ? "Tous" : s === "actif" ? "Actifs" : "Inactifs"}
                      </button>
                    ))}
                  </div>
                  {/* Sort */}
                  <div className="flex items-center gap-1.5 ml-auto">
                    <span className="text-xs text-app-dark/50">Trier :</span>
                    <select
                      className="rounded-lg border border-app-muted bg-white px-2 py-1 text-xs text-app-dark outline-none"
                      value={adminUserSort}
                      onChange={(e) => { setAdminUserSort(e.target.value as "az" | "za" | "recent"); setAdminUsersPage(1); }}
                    >
                      <option value="az">A â†’ Z</option>
                      <option value="za">Z â†’ A</option>
                      <option value="recent">Plus récents</option>
                    </select>
                  </div>
                  {/* Reset */}
                  {(adminStatusFilter !== "tous" || adminUserSort !== "az") && (
                    <button
                      type="button"
                      className="text-xs text-app-accent underline"
                      onClick={() => { setAdminStatusFilter("tous"); setAdminUserSort("az"); setAdminUsersPage(1); }}
                    >
                      Réinitialiser
                    </button>
                  )}
                </div>

                {adminData.users.length === 0 && (
                  <p className="mt-3 text-sm text-app-dark/70">Aucun utilisateur trouvé.</p>
                )}

                {/* Role groups with pagination */}
                {(() => {
                  // Build the full filtered+sorted list across all roles
                  const allFiltered = adminData.users.filter((u) => {
                    if (adminUserRoleFilter && u.role !== adminUserRoleFilter) return false;
                    if (adminStatusFilter === "actif" && !u.is_active) return false;
                    if (adminStatusFilter === "inactif" && u.is_active) return false;
                    if (adminUserSearch) {
                      const q = adminUserSearch.toLowerCase();
                      if (!u.username.toLowerCase().includes(q) && !(u.email ?? "").toLowerCase().includes(q)) return false;
                    }
                    return true;
                  }).sort((a, b) => {
                    if (adminUserSort === "za") return b.username.localeCompare(a.username);
                    if (adminUserSort === "recent") return b.id - a.id;
                    return a.username.localeCompare(b.username);
                  });

                  const totalFiltered = allFiltered.length;
                  const totalPages = Math.max(1, Math.ceil(totalFiltered / ADMIN_USERS_PER_PAGE));
                  const safePage = Math.min(adminUsersPage, totalPages);
                  const pageStart = (safePage - 1) * ADMIN_USERS_PER_PAGE;
                  const pageEnd = pageStart + ADMIN_USERS_PER_PAGE;
                  const pageUsers = allFiltered.slice(pageStart, pageEnd);

                  // Group page users by role
                  const roleOrder = ["Stagiaire", "Instructeur", "Coordinateur", "Admin"];
                  const groups: Record<string, typeof pageUsers> = {};
                  for (const rg of roleOrder) groups[rg] = pageUsers.filter((u) => u.role === rg);

                  return (
                    <>
                      {/* Summary bar */}
                      <div className="mt-3 flex items-center justify-between text-xs text-app-dark/50">
                        <span>
                          {totalFiltered === 0
                            ? "Aucun résultat"
                            : `Affichage ${pageStart + 1}â€“${Math.min(pageEnd, totalFiltered)} sur ${totalFiltered} utilisateur${totalFiltered > 1 ? "s" : ""}`}
                        </span>
                        {adminUserSearch && totalFiltered === 0 && (
                          <span className="text-app-dark/40">Aucun résultat pour « {adminUserSearch} »</span>
                        )}
                      </div>

                      <div className="mt-3 grid gap-5">
                        {roleOrder.filter((rg) => groups[rg].length > 0).map((roleGroup) => (
                          <div key={roleGroup} className="overflow-hidden rounded-xl border border-app-muted">
                            {/* Group header */}
                            <div className="flex items-center justify-between px-4 py-2.5 text-white" style={{ background: "#15173D" }}>
                              <span className="text-sm font-bold uppercase tracking-wide">{roleGroup}s</span>
                              <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-bold">{groups[roleGroup].length}</span>
                            </div>
                            {/* User rows */}
                            <div className="divide-y divide-app-muted/50 bg-white">
                              {groups[roleGroup].map((u) => {
                                const rps = resetPasswordState[u.id] ?? { value: "", show: false, saved: "" };
                                return (
                                  <div key={`user-${u.id}`} className="flex flex-wrap items-center gap-3 px-4 py-3">
                                    {/* Avatar */}
                                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: "#15173D" }}>
                                      {u.username[0]?.toUpperCase()}
                                    </div>
                                    {/* Info */}
                                    <div className="min-w-0 flex-1">
                                      <p className="truncate text-sm font-semibold text-app-dark">{u.username}</p>
                                      <p className="truncate text-xs text-app-dark/50">{u.email || "â€”"}</p>
                                    </div>
                                    {/* Status */}
                                    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${u.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                                      {u.is_active ? "Actif" : "Inactif"}
                                    </span>
                                    {/* Password saved badge */}
                                    {rps.saved && (
                                      <span className="flex items-center gap-1 rounded bg-green-50 px-2 py-0.5 font-mono text-xs text-green-800">
                                        {rps.saved}
                                        <button className="text-green-600 hover:text-green-800" onClick={() => navigator.clipboard.writeText(rps.saved)} type="button">âŽ˜</button>
                                      </span>
                                    )}
                                    {/* Password reset inline */}
                                    <div className="flex items-center gap-1">
                                      <div className="relative flex items-center">
                                        <input
                                          className="w-32 rounded border border-app-muted px-2 py-1 pr-6 font-mono text-xs outline-none focus:border-app-accent"
                                          placeholder="Nouveau mdp"
                                          type={rps.show ? "text" : "password"}
                                          value={rps.value}
                                          onChange={(e) => setResetPasswordState((prev) => ({ ...prev, [u.id]: { ...rps, value: e.target.value } }))}
                                        />
                                        <button
                                          className="absolute right-1 text-app-dark/40 hover:text-app-dark"
                                          onClick={() => setResetPasswordState((prev) => ({ ...prev, [u.id]: { ...rps, show: !rps.show } }))}
                                          type="button"
                                        >
                                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={rps.show ? "M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" : "M15 12a3 3 0 11-6 0 3 3 0 016 0zM2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"} />
                                          </svg>
                                        </button>
                                      </div>
                                      <button
                                        className="rounded bg-app-accent px-2 py-1 text-xs text-white disabled:opacity-40"
                                        disabled={!rps.value}
                                        onClick={async () => {
                                          await apiFetch(`/api/admin/users/${u.id}/reset-password/`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: rps.value }) });
                                          setResetPasswordState((prev) => ({ ...prev, [u.id]: { value: "", show: false, saved: rps.value } }));
                                        }}
                                        type="button"
                                      >
                                        âœ“
                                      </button>
                                    </div>
                                    {/* Send password by email */}
                                    {(() => {
                                      const es = emailResetState[u.id] ?? "idle";
                                      return (
                                        <button
                                          type="button"
                                          title={u.email ? `Envoyer par email (${u.email})` : "Aucune adresse email configurée"}
                                          disabled={!u.email || es === "loading"}
                                          className="shrink-0 flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold transition disabled:opacity-40"
                                          style={{
                                            background: es === "sent" ? "rgba(34,197,94,0.12)" : es === "error" || es === "no_email" ? "rgba(239,68,68,0.1)" : "rgba(21,23,61,0.07)",
                                            color: es === "sent" ? "#16a34a" : es === "error" || es === "no_email" ? "#dc2626" : "#15173D",
                                          }}
                                          onClick={async () => {
                                            setEmailResetState((prev) => ({ ...prev, [u.id]: "loading" }));
                                            const r = await apiFetch(`/api/admin/users/${u.id}/send-password-email/`, { method: "POST" });
                                            const data: { detail: string } = await r.json();
                                            if (r.ok) {
                                              setEmailResetState((prev) => ({ ...prev, [u.id]: "sent" }));
                                              setTimeout(() => setEmailResetState((prev) => ({ ...prev, [u.id]: "idle" })), 4000);
                                            } else if (data.detail === "no_email") {
                                              setEmailResetState((prev) => ({ ...prev, [u.id]: "no_email" }));
                                              setTimeout(() => setEmailResetState((prev) => ({ ...prev, [u.id]: "idle" })), 3000);
                                            } else {
                                              setEmailResetState((prev) => ({ ...prev, [u.id]: "error" }));
                                              setTimeout(() => setEmailResetState((prev) => ({ ...prev, [u.id]: "idle" })), 3000);
                                            }
                                          }}
                                        >
                                          {es === "loading" ? (
                                            <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>
                                          ) : es === "sent" ? (
                                            <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                          ) : (
                                            <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                                          )}
                                          {es === "sent" ? "Envoyé" : es === "no_email" ? "Pas d'email" : es === "error" ? "Erreur" : "Email"}
                                        </button>
                                      );
                                    })()}
                                    {/* Toggle active */}
                                    <button
                                      className="shrink-0 rounded bg-app-dark px-2 py-1 text-xs text-white disabled:opacity-40"
                                      disabled={u.id === user.id}
                                      onClick={() => void handleToggleUserStatus(u.id)}
                                      type="button"
                                    >
                                      {u.is_active ? "Désactiver" : "Activer"}
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                        {totalFiltered === 0 && adminData.users.length > 0 && (
                          <p className="py-6 text-center text-sm text-app-dark/50">Aucun résultat avec ces filtres.</p>
                        )}
                      </div>

                      {/* â”€â”€ Pagination â”€â”€ */}
                      {totalPages > 1 && (
                        <div className="mt-5 flex items-center justify-between gap-2">
                          <button
                            type="button"
                            disabled={safePage <= 1}
                            className="rounded-lg border border-app-muted bg-white px-3 py-1.5 text-xs font-semibold text-app-dark transition hover:bg-app-soft disabled:opacity-40"
                            onClick={() => setAdminUsersPage((p) => Math.max(1, p - 1))}
                          >
                            â† Précédent
                          </button>
                          <div className="flex items-center gap-1">
                            {Array.from({ length: totalPages }, (_, i) => i + 1).map((pg) => (
                              <button
                                key={pg}
                                type="button"
                                className={`h-7 w-7 rounded text-xs font-semibold transition ${safePage === pg ? "text-white" : "text-app-dark/60 hover:bg-app-soft"}`}
                                style={safePage === pg ? { background: "#982598" } : {}}
                                onClick={() => setAdminUsersPage(pg)}
                              >
                                {pg}
                              </button>
                            ))}
                          </div>
                          <button
                            type="button"
                            disabled={safePage >= totalPages}
                            className="rounded-lg border border-app-muted bg-white px-3 py-1.5 text-xs font-semibold text-app-dark transition hover:bg-app-soft disabled:opacity-40"
                            onClick={() => setAdminUsersPage((p) => Math.min(totalPages, p + 1))}
                          >
                            Suivant â†’
                          </button>
                        </div>
                      )}
                    </>
                  );
                })()}
              </PanelSection>
            ) : null}

            {adminView === "users" && selectedAdminUser ? (
              <PanelSection title="User details">
                <BackButton onClick={() => setSelectedAdminUser(null)} />
                <MetricGrid>
                  <MetricCard label="Username" value={selectedAdminUser.username} />
                  <MetricCard label="Email" value={selectedAdminUser.email || "-"} />
                  <MetricCard label="Role" value={selectedAdminUser.role} />
                  <MetricCard label="Status" value={selectedAdminUser.is_active ? "Actif" : "Inactif"} />
                </MetricGrid>
                <button
                  className="mt-3 rounded bg-app-dark px-3 py-1.5 text-xs text-white disabled:opacity-50"
                  disabled={selectedAdminUser.id === user.id}
                  onClick={async () => {
                    await handleToggleUserStatus(selectedAdminUser.id);
                    setSelectedAdminUser(null);
                  }}
                  type="button"
                >
                  {selectedAdminUser.is_active ? "Desactiver" : "Activer"}
                </button>
              </PanelSection>
            ) : null}

            {(adminView === "accounts" || adminView === "bulk_csv") ? (
              <div className="grid gap-6">
                <PanelSection
                  title={adminView === "bulk_csv" ? "Import CSV (bulk)" : "Gestion des comptes"}
                  subtitle={adminView === "bulk_csv" ? "Importez plusieurs comptes en une seule operation via un fichier CSV." : "Creer des comptes pour tous les roles ou importer en masse par CSV."}
                />

                {adminView !== "bulk_csv" && <>
                <SubCard title="Creation unitaire">
                  <form className="mt-3 grid gap-3 md:grid-cols-2" onSubmit={handleCreateAccount}>
                    <Input
                      label="Username"
                      value={accountForm.username}
                      onChange={(value) => setAccountForm((prev) => ({ ...prev, username: value }))}
                    />
                    <Input
                      label="Email"
                      value={accountForm.email}
                      onChange={(value) => setAccountForm((prev) => ({ ...prev, email: value }))}
                    />
                    <TextField
                      fullWidth
                      label="Password"
                      required
                      size="small"
                      type={showAccountPassword ? "text" : "password"}
                      value={accountForm.password}
                      variant="outlined"
                      onChange={(e) => setAccountForm((prev) => ({ ...prev, password: e.target.value }))}
                      InputProps={{
                        endAdornment: (
                          <InputAdornment position="end">
                            <button
                              type="button"
                              className="text-app-dark/50 hover:text-app-dark"
                              onClick={() => setShowAccountPassword((v) => !v)}
                            >
                              {showAccountPassword ? (
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                                </svg>
                              ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </svg>
                              )}
                            </button>
                          </InputAdornment>
                        ),
                      }}
                    />
                    <label className="grid gap-1 text-sm font-medium text-app-dark">
                      Role
                      <select
                        className="rounded-md border border-app-muted bg-white px-3 py-2 outline-none focus:border-app-accent"
                        value={accountForm.role}
                        onChange={(event) =>
                          setAccountForm((prev) => ({
                            ...prev,
                            role: event.target.value,
                            est_civil: event.target.value === "Instructeur" ? prev.est_civil : false,
                          }))
                        }
                      >
                        {["Instructeur", "Stagiaire", "Coordinateur", "Admin"].map((roleName) => (
                          <option key={roleName} value={roleName}>
                            {roleName}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Input
                      label={(accountForm.role === "Instructeur" && accountForm.est_civil) || accountForm.role === "Admin" ? "Matricule (optionnel)" : "Matricule"}
                      value={accountForm.matricule}
                      onChange={(value) => setAccountForm((prev) => ({ ...prev, matricule: value }))}
                      required={!(accountForm.role === "Instructeur" && accountForm.est_civil) && accountForm.role !== "Admin"}
                    />
                    {accountForm.role === "Instructeur" ? (
                      <label className="flex items-center gap-2 text-sm font-medium text-app-dark">
                        <input
                          checked={accountForm.est_civil}
                          onChange={(event) => setAccountForm((prev) => ({ ...prev, est_civil: event.target.checked }))}
                          type="checkbox"
                        />
                        Instructeur civil
                      </label>
                    ) : null}
                    {!(accountForm.role === "Instructeur" && accountForm.est_civil) && accountForm.role !== "Admin" ? (
                      <>
                        <label className="grid gap-1 text-sm font-medium text-app-dark">
                          Corp
                          <select
                            className="rounded-md border border-app-muted bg-white px-3 py-2 outline-none focus:border-app-accent"
                            onChange={(event) =>
                              setAccountForm((prev) => ({ ...prev, corps_id: event.target.value, rank_id: "", speciality_id: "" }))
                            }
                            required
                            value={accountForm.corps_id}
                          >
                            <option value="">Selectionner</option>
                            {referencesData.corps.map((corp) => (
                              <option key={corp.id} value={corp.id}>
                                {corp.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="grid gap-1 text-sm font-medium text-app-dark">
                          Rank
                          <select
                            className="rounded-md border border-app-muted bg-white px-3 py-2 outline-none focus:border-app-accent"
                            onChange={(event) => setAccountForm((prev) => ({ ...prev, rank_id: event.target.value }))}
                            required
                            value={accountForm.rank_id}
                          >
                            <option value="">Selectionner</option>
                            {referencesData.ranks
                              .filter((rank) => rank.corps_id === accountForm.corps_id)
                              .map((rank) => (
                                <option key={rank.id} value={rank.id}>
                                  {rank.label}
                                </option>
                              ))}
                          </select>
                        </label>
                        <label className="grid gap-1 text-sm font-medium text-app-dark">
                          Speciality
                          <select
                            className="rounded-md border border-app-muted bg-white px-3 py-2 outline-none focus:border-app-accent"
                            onChange={(event) => setAccountForm((prev) => ({ ...prev, speciality_id: event.target.value }))}
                            required
                            value={accountForm.speciality_id}
                          >
                            <option value="">Selectionner</option>
                            {referencesData.specialities
                              .filter((s) => !s.corps_id || s.corps_id === accountForm.corps_id)
                              .map((speciality) => (
                                <option key={speciality.id} value={speciality.id}>
                                  {speciality.label}
                                </option>
                              ))}
                          </select>
                        </label>
                      </>
                    ) : null}
                    <button className="rounded bg-app-dark px-3 py-2 text-sm font-semibold text-white md:col-span-2" type="submit">
                      Creer le compte
                    </button>
                  </form>
                </SubCard>

                {lastCreatedAccount && (
                  <div className="rounded-lg border-2 border-green-400 bg-green-50 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="font-semibold text-green-800">Compte créé avec succès</h3>
                      <button
                        className="text-green-600 hover:text-green-800"
                        onClick={() => setLastCreatedAccount(null)}
                      >
                        âœ•
                      </button>
                    </div>
                    <div className="grid gap-2 text-sm">
                      {[
                        { label: "Username", value: lastCreatedAccount.username },
                        { label: "Mot de passe", value: lastCreatedAccount.password },
                        { label: "Rôle", value: lastCreatedAccount.role },
                        { label: "Matricule", value: lastCreatedAccount.matricule },
                      ].map(({ label, value }) => (
                        <div key={label} className="flex items-center justify-between rounded bg-white px-3 py-2">
                          <span className="font-medium text-green-700">{label}:</span>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-green-900">{value}</span>
                            <button
                              className="rounded bg-green-200 px-2 py-0.5 text-xs text-green-800 hover:bg-green-300"
                              onClick={() => navigator.clipboard.writeText(value)}
                            >
                              Copier
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                </>}

                <SubCard title="Import CSV (bulk)">
                  <p className="mt-1 text-xs text-app-dark/70">
                    Headers attendus: username,email,password,role,matricule,est_civil,corps_id,rank_id,speciality_id
                  </p>
                  <p className="mt-1 text-xs text-app-dark/50">
                    Roles valides: Instructeur, Stagiaire, Coordinateur, Admin. Pour Instructeur civil: est_civil=true, laisser corps/rank/speciality vides.
                  </p>
                  {referencesData.corps.length > 0 && (
                    <details className="mt-3 text-xs">
                      <summary className="cursor-pointer font-semibold text-app-dark/70">IDs de reference (corps / ranks / specialites)</summary>
                      <div className="mt-2 grid gap-2">
                        <div>
                          <p className="font-semibold text-app-dark/60">Corps</p>
                          {referencesData.corps.map((c) => (
                            <p key={c.id} className="font-mono text-app-dark/50">{c.id} â€” {c.label}</p>
                          ))}
                        </div>
                        <div>
                          <p className="font-semibold text-app-dark/60">Ranks</p>
                          {referencesData.ranks.map((r) => (
                            <p key={r.id} className="font-mono text-app-dark/50">{r.id} â€” {r.label} ({referencesData.corps.find((c) => c.id === r.corps_id)?.label ?? r.corps_id})</p>
                          ))}
                        </div>
                        <div>
                          <p className="font-semibold text-app-dark/60">Specialites</p>
                          {referencesData.specialities.map((s) => (
                            <p key={s.id} className="font-mono text-app-dark/50">{s.id} â€” {s.label}</p>
                          ))}
                        </div>
                      </div>
                    </details>
                  )}
                  <form className="mt-3 grid gap-3" onSubmit={handleBulkCsvUpload}>
                    <input
                      id="accounts-csv-input"
                      accept=".csv,text/csv"
                      className="rounded border border-app-muted bg-white px-3 py-2 text-sm"
                      onChange={(event) => setCsvFileName(event.target.files?.[0]?.name ?? "")}
                      type="file"
                      required
                    />
                    {csvFileName ? <p className="text-xs text-app-dark/70">Fichier: {csvFileName}</p> : null}
                    <button className="rounded bg-app-dark px-3 py-2 text-sm font-semibold text-white" type="submit">
                      Importer les comptes
                    </button>
                  </form>
                  {csvErrors.length > 0 && (
                    <div className="mt-4">
                      <p className="text-xs font-semibold text-red-600">{csvErrors.length} erreur(s) de validation:</p>
                      <div className="mt-1 max-h-48 overflow-y-auto rounded border border-red-200 bg-red-50 p-2">
                        {csvErrors.map((e, i) => (
                          <p key={i} className="text-xs text-red-700">
                            <span className="font-semibold">Ligne {e.line}:</span> {e.error}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}
                </SubCard>
              </div>
            ) : null}

            {adminView === "subjects" ? (
              <div className="grid gap-6">
                <div className="flex flex-wrap items-center gap-2">
                  <TabButton active={subjectTab === "subjects"} onClick={() => setSubjectTab("subjects")}>
                    Subjects
                  </TabButton>
                  <TabButton active={subjectTab === "controls"} onClick={() => setSubjectTab("controls")}>
                    Controls
                  </TabButton>
                  <TabButton active={subjectTab === "courses"} onClick={() => setSubjectTab("courses")}>
                    Cours
                  </TabButton>
                </div>

                {subjectTab === "subjects" ? (
                  <div className="grid gap-4">
                    <SubCard title="Creer un sujet">
                      <form className="mt-3 flex gap-2" onSubmit={handleCreateSubject}>
                        <input
                          className="w-full rounded border border-app-muted bg-white px-3 py-2 text-sm"
                          placeholder="Ex: Mathematiques"
                          value={newSubjectLabel}
                          onChange={(event) => setNewSubjectLabel(event.target.value)}
                          required
                        />
                        <button className="rounded bg-app-dark px-3 py-2 text-sm font-semibold text-white" type="submit">
                          Creer
                        </button>
                      </form>
                    </SubCard>

                    <SubCard title="Liste des sujets">
                      <div className="mt-3 flex flex-wrap gap-2">
                        {subjects.map((subject) => (
                          <button
                            key={subject.id}
                            className={`rounded px-2 py-1 text-xs ${selectedSubjectId === subject.id ? "bg-app-dark text-white" : "bg-app-soft text-app-dark"}`}
                            onClick={() => setSelectedSubjectId(subject.id)}
                            type="button"
                          >
                            {subject.label}
                          </button>
                        ))}
                        {subjects.length === 0 ? <EmptyState message="Aucun sujet disponible. Creez un sujet pour commencer." /> : null}
                      </div>
                    </SubCard>
                  </div>
                ) : (
                  <>
                    {subjectTab === "controls" ? (
                      <SubCard title="Controles crees par sujet">
                        {subjects.length === 0 ? <EmptyState message="Aucun sujet disponible. Creez un sujet avant de gerer les controles." /> : null}
                        <div className="mb-3">
                          <label className="grid gap-1 text-sm font-medium text-app-dark">
                            Sujet
                            <select
                              className="rounded border border-app-muted bg-white px-3 py-2"
                              value={selectedSubjectId}
                              onChange={(event) => setSelectedSubjectId(event.target.value)}
                            >
                              <option value="">Selectionner un sujet</option>
                              {subjects.map((subject) => (
                                <option key={subject.id} value={subject.id}>
                                  {subject.label}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                        <div className="flex items-center gap-2 rounded-lg border border-app-muted bg-app-soft px-3 py-2">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0 text-app-dark/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                          </svg>
                          <input
                            className="w-full bg-transparent text-sm outline-none placeholder:text-app-dark/40"
                            placeholder="Rechercher un contrôleâ€¦"
                            value={adminControlSearch}
                            onChange={(e) => setAdminControlSearch(e.target.value)}
                          />
                          {adminControlSearch ? (
                            <button className="text-app-dark/40 hover:text-app-dark" onClick={() => setAdminControlSearch("")} type="button">âœ•</button>
                          ) : null}
                        </div>
                        <div className="mt-3 space-y-2">
                          {subjectControls
                            .filter((control) =>
                              control.name.toLowerCase().includes(adminControlSearch.toLowerCase()) ||
                              control.cours_title.toLowerCase().includes(adminControlSearch.toLowerCase()) ||
                              control.instructeur_username.toLowerCase().includes(adminControlSearch.toLowerCase())
                            )
                            .map((control) => (
                            <div className="rounded border border-app-muted/60 p-3" key={control.id}>
                              <p className="text-sm font-semibold">{control.name}</p>
                              <p className="text-xs text-app-dark/70">{control.cours_title} - {control.instructeur_username}</p>
                              <div className="mt-2 flex flex-wrap gap-2">
                                {["BROUILLON", "PUBLIE", "CLOTURE", "CORRIGE"].map((statusValue) => (
                                  <button
                                    key={statusValue}
                                    className={`rounded px-2 py-1 text-xs ${control.status === statusValue ? "bg-app-dark text-white" : "bg-app-soft text-app-dark"}`}
                                    onClick={() => void handleUpdateControlStatus(control.id, statusValue)}
                                    type="button"
                                  >
                                    {statusValue}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                          {selectedSubjectId && subjectControls.length === 0 ? <EmptyState message="Aucun controle pour ce sujet." /> : null}
                          {subjectControls.length > 0 && adminControlSearch && subjectControls.filter((c) => c.name.toLowerCase().includes(adminControlSearch.toLowerCase()) || c.cours_title.toLowerCase().includes(adminControlSearch.toLowerCase()) || c.instructeur_username.toLowerCase().includes(adminControlSearch.toLowerCase())).length === 0 ? (
                            <p className="text-sm text-app-dark/50">Aucun résultat pour « {adminControlSearch} ».</p>
                          ) : null}
                        </div>
                      </SubCard>
                    ) : null}

                    {subjectTab === "courses" ? (
                      <SubCard title="Cours crees par sujet">
                        {subjects.length === 0 ? <EmptyState message="Aucun sujet disponible. Creez un sujet avant de gerer les cours." /> : null}
                        <div className="mb-3">
                          <label className="grid gap-1 text-sm font-medium text-app-dark">
                            Sujet
                            <select
                              className="rounded border border-app-muted bg-white px-3 py-2"
                              value={selectedSubjectId}
                              onChange={(event) => setSelectedSubjectId(event.target.value)}
                            >
                              <option value="">Selectionner un sujet</option>
                              {subjects.map((subject) => (
                                <option key={subject.id} value={subject.id}>
                                  {subject.label}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                        <div className="flex items-center gap-2 rounded-lg border border-app-muted bg-app-soft px-3 py-2">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0 text-app-dark/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                          </svg>
                          <input
                            className="w-full bg-transparent text-sm outline-none placeholder:text-app-dark/40"
                            placeholder="Rechercher un coursâ€¦"
                            value={adminCoursSearch}
                            onChange={(e) => setAdminCoursSearch(e.target.value)}
                          />
                          {adminCoursSearch ? (
                            <button className="text-app-dark/40 hover:text-app-dark" onClick={() => setAdminCoursSearch("")} type="button">âœ•</button>
                          ) : null}
                        </div>
                        <div className="mt-3 space-y-2">
                          {subjectCourses
                            .filter((course) =>
                              course.title.toLowerCase().includes(adminCoursSearch.toLowerCase()) ||
                              course.instructeur_username.toLowerCase().includes(adminCoursSearch.toLowerCase())
                            )
                            .map((course) => (
                            <div className="rounded border border-app-muted/60 p-3" key={course.id}>
                              <p className="text-sm font-semibold">{course.title}</p>
                              <p className="text-xs text-app-dark/70">{course.instructeur_username}</p>
                              <div className="mt-2 flex flex-wrap gap-2">
                                {["BROUILLON", "PUBLIE", "ARCHIVE"].map((statusValue) => (
                                  <button
                                    key={statusValue}
                                    className={`rounded px-2 py-1 text-xs ${course.status === statusValue ? "bg-app-dark text-white" : "bg-app-soft text-app-dark"}`}
                                    onClick={() => void handleUpdateCourseStatus(course.id, statusValue)}
                                    type="button"
                                  >
                                    {statusValue}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                          {selectedSubjectId && subjectCourses.length === 0 ? <EmptyState message="Aucun cours pour ce sujet." /> : null}
                          {subjectCourses.length > 0 && adminCoursSearch && subjectCourses.filter((c) => c.title.toLowerCase().includes(adminCoursSearch.toLowerCase()) || c.instructeur_username.toLowerCase().includes(adminCoursSearch.toLowerCase())).length === 0 ? (
                            <p className="text-sm text-app-dark/50">Aucun résultat pour « {adminCoursSearch} ».</p>
                          ) : null}
                        </div>
                      </SubCard>
                    ) : null}
                  </>
                )}
              </div>
            ) : null}

            {adminView === "references" ? (
              <ReferenceManagementSection
                referencesData={referencesData}
                referenceTab={referenceTab}
                setReferenceTab={setReferenceTab}
                newCorps={newCorps}
                setNewCorps={setNewCorps}
                newRank={newRank}
                setNewRank={setNewRank}
                newSpeciality={newSpeciality}
                setNewSpeciality={setNewSpeciality}
                handleCreateCorps={handleCreateCorps}
                handleCreateRank={handleCreateRank}
                handleCreateSpeciality={handleCreateSpeciality}
                handleRenameCorps={handleRenameCorps}
                handleRenameRank={handleRenameRank}
                handleRenameSpeciality={handleRenameSpeciality}
                handleDeleteCorps={handleDeleteCorps}
                handleDeleteRank={handleDeleteRank}
                handleDeleteSpeciality={handleDeleteSpeciality}
              />
            ) : null}

            {adminView === "classement" ? (
              <div className="grid gap-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-app-dark">Classement des stagiaires</h2>
                    <p className="text-xs text-app-dark/40 mt-0.5">Classement par moyenne des notes publiées, par classe.</p>
                  </div>
                  <button type="button" onClick={() => void loadAdminClassement()} className="flex items-center gap-1.5 rounded-lg border border-app-muted bg-white px-3 py-1.5 text-xs font-semibold text-app-dark hover:bg-app-soft transition">
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                    Actualiser
                  </button>
                </div>
                {!adminClassementData ? (
                  <div className="flex items-center justify-center py-16">
                    <svg className="h-6 w-6 animate-spin text-app-accent" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>
                  </div>
                ) : adminClassementData.classes.length === 0 ? (
                  <div className="rounded-2xl border border-app-muted bg-white p-10 text-center">
                    <p className="text-sm text-app-dark/40">Aucune classe avec des stagiaires actifs.</p>
                  </div>
                ) : adminClassementData.classes.map((cls) => (
                  <div key={`admin-cls-${cls.classe_code}`} className="overflow-hidden rounded-2xl border border-app-muted bg-white shadow-sm">
                    <div className="flex items-center justify-between px-6 py-4 border-b border-app-muted/60" style={{ background: "#15173D" }}>
                      <div>
                        <p className="font-bold text-white">{cls.classe_label || cls.classe_code}</p>
                        <p className="text-xs text-white/50">{cls.total} stagiaire(s)</p>
                      </div>
                      {(() => {
                        const noted = cls.leaderboard.filter(e => e.moyenne != null);
                        const avg = noted.length > 0 ? noted.reduce((s, e) => s + (e.moyenne ?? 0), 0) / noted.length : null;
                        return avg != null ? (
                          <span className="rounded-full px-3 py-1 text-sm font-black text-white" style={{ background: avg >= 10 ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)" }}>
                            Moy. classe : {avg.toFixed(2)}/20
                          </span>
                        ) : <span className="text-xs text-white/40">Aucune note</span>;
                      })()}
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead>
                          <tr className="border-b border-app-muted/60 text-left text-xs font-semibold uppercase tracking-wide text-app-dark/40">
                            <th className="px-5 py-3 w-14">Rang</th>
                            <th className="px-4 py-3">Stagiaire</th>
                            <th className="px-4 py-3 text-right">Moyenne</th>
                            <th className="px-4 py-3 text-right">Notes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cls.leaderboard.map((entry, idx) => {
                            const medal = entry.rank === 1 ? "ðŸ¥‡" : entry.rank === 2 ? "ðŸ¥ˆ" : entry.rank === 3 ? "ðŸ¥‰" : null;
                            return (
                              <tr key={`admin-entry-${idx}`} className="border-b border-app-muted/40 last:border-0 hover:bg-app-soft/40 transition">
                                <td className="px-5 py-3 text-center">
                                  {medal ? <span className="text-lg">{medal}</span> : <span className="text-sm font-bold text-app-dark/60">{entry.rank ?? "â€”"}</span>}
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2">
                                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ background: "#15173D" }}>
                                      {entry.username[0]?.toUpperCase()}
                                    </div>
                                    <span className="font-medium text-app-dark">{entry.username}</span>
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-right">
                                  {entry.moyenne != null ? (
                                    <div className="flex flex-col items-end gap-1">
                                      <span className="font-black text-sm" style={{ color: entry.moyenne >= 10 ? "#16a34a" : "#dc2626" }}>{entry.moyenne}/20</span>
                                      <div className="h-1.5 w-20 rounded-full bg-app-muted overflow-hidden">
                                        <div className="h-full rounded-full" style={{ width: `${(entry.moyenne / 20) * 100}%`, background: entry.moyenne >= 10 ? "#22c55e" : "#ef4444" }} />
                                      </div>
                                    </div>
                                  ) : <span className="text-xs italic text-app-dark/30">Non noté</span>}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <span className="rounded-full bg-app-soft px-2 py-0.5 text-xs font-semibold text-app-dark/60">{entry.evaluations_count}</span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {adminView === "fichiers_renseignement" ? (
              <div className="grid gap-6">
                <PanelSection title="Fichiers de renseignement" subtitle="Liste des fichiers de renseignement soumis par les stagiaires.">
                  <button
                    className="mt-3 rounded bg-app-dark px-3 py-1.5 text-xs text-white"
                    onClick={() => void loadAdminFichiersRenseignement()}
                    type="button"
                  >
                    Rafraichir
                  </button>
                </PanelSection>

                {/* Template document management */}
                <SubCard title="Document modele">
                  <p className="mb-3 text-xs text-app-dark/60">Definissez le document modele que les stagiaires devront telecharger, remplir et remettre.</p>
                  {adminFichierTemplate?.has_template && (
                    <div className="mb-3 flex items-center gap-3 rounded-xl border border-app-muted bg-app-soft/60 px-3 py-2">
                      <svg className="h-4 w-4 shrink-0 text-app-dark/50" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                      <span className="flex-1 truncate text-xs font-medium text-app-dark">{adminFichierTemplate.nom_fichier}</span>
                      <button
                        className="rounded bg-app-dark px-2 py-1 text-xs text-white hover:bg-app-accent"
                        onClick={() => void handleAdminDownloadFichierTemplate()}
                        type="button"
                      >
                        Telecharger
                      </button>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-app-muted bg-white px-3 py-1.5 text-xs font-medium text-app-dark hover:border-app-dark/30 transition">
                      <svg className="h-3.5 w-3.5 text-app-dark/50" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                      {adminFichierTemplateFile ? adminFichierTemplateFile.name : "Choisir un fichier"}
                      <input type="file" className="hidden" onChange={(e) => setAdminFichierTemplateFile(e.target.files?.[0] ?? null)} />
                    </label>
                    <button
                      className="rounded bg-app-dark px-3 py-1.5 text-xs text-white hover:bg-app-accent disabled:opacity-40 transition"
                      disabled={!adminFichierTemplateFile}
                      onClick={() => void handleAdminUploadFichierTemplate()}
                      type="button"
                    >
                      {adminFichierTemplate?.has_template ? "Mettre a jour le modele" : "Definir le modele"}
                    </button>
                  </div>
                </SubCard>

                <SubCard title="Fichiers soumis">
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-xs">
                      <thead>
                        <tr className="border-b border-app-muted text-left">
                          <th className="py-2 px-3">Stagiaire</th>
                          <th className="py-2 px-3">Sujet</th>
                          <th className="py-2 px-3">Nom du fichier</th>
                          <th className="py-2 px-3">Etat</th>
                          <th className="py-2 px-3">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {adminFichiersRenseignement === null ? (
                          <tr><td className="py-3 text-sm text-app-dark/60" colSpan={5}>Chargement...</td></tr>
                        ) : adminFichiersRenseignement.length === 0 ? (
                          <tr><td className="py-3 text-sm text-app-dark/60" colSpan={5}>Aucun stagiaire avec sujet de fin de stage.</td></tr>
                        ) : (
                          adminFichiersRenseignement.map((item) => (
                            <tr className="border-b border-app-muted/40" key={item.stagiaire_id}>
                              <td className="py-2 px-3 font-medium">{item.stagiaire_username}</td>
                              <td className="py-2 px-3">{item.sujet_titre}</td>
                              <td className="py-2 px-3">{item.has_fichier ? item.nom_fichier : <span className="italic text-app-dark/40">Non soumis</span>}</td>
                              <td className="py-2 px-3">
                                {item.has_fichier ? (
                                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">Soumis</span>
                                ) : (
                                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-600">Non soumis</span>
                                )}
                              </td>
                              <td className="py-2 px-3">
                                {item.has_fichier ? (
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      className="rounded bg-app-dark px-2 py-1 text-xs text-white hover:bg-app-accent"
                                      onClick={() => void handleAdminPreviewFichierRenseignement(item.stagiaire_id)}
                                      type="button"
                                    >
                                      Voir
                                    </button>
                                    <button
                                      className="rounded border border-app-muted bg-white px-2 py-1 text-xs text-app-dark hover:bg-app-soft"
                                      onClick={() => void handleAdminDownloadFichierRenseignement(item.stagiaire_id, item.nom_fichier)}
                                      type="button"
                                    >
                                      Telecharger
                                    </button>
                                  </div>
                                ) : (
                                  <span className="text-xs text-app-dark/40">â€”</span>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </SubCard>
              </div>
            ) : null}

            {/* â”€â”€ Preview modal â”€â”€ */}
            {adminPreviewFichier && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
                onClick={() => setAdminPreviewFichier(null)}
              >
                <div
                  className="relative flex w-full max-w-4xl flex-col rounded-2xl bg-white shadow-2xl overflow-hidden"
                  style={{ maxHeight: "90vh" }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Header */}
                  <div className="flex items-center justify-between border-b border-app-muted px-5 py-3">
                    <p className="truncate text-sm font-semibold text-app-dark">{adminPreviewFichier.nom_fichier}</p>
                    <div className="flex items-center gap-2 ml-4 shrink-0">
                      <button
                        className="rounded border border-app-muted bg-app-soft px-3 py-1 text-xs font-medium text-app-dark hover:bg-white transition"
                        onClick={() => triggerDownload(adminPreviewFichier.base64, adminPreviewFichier.nom_fichier, adminPreviewFichier.mime_type)}
                        type="button"
                      >
                        Telecharger
                      </button>
                      <button
                        className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-app-soft transition text-app-dark/60"
                        onClick={() => setAdminPreviewFichier(null)}
                        type="button"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  </div>
                  {/* Content */}
                  <div className="flex-1 overflow-auto p-4">
                    {adminPreviewFichier.mime_type === "application/pdf" || adminPreviewFichier.nom_fichier.toLowerCase().endsWith(".pdf") ? (
                      <InlinePdfViewer base64={adminPreviewFichier.base64} name={adminPreviewFichier.nom_fichier} />
                    ) : adminPreviewFichier.mime_type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || adminPreviewFichier.nom_fichier.toLowerCase().endsWith(".docx") ? (
                      <InlineDocxViewer base64={adminPreviewFichier.base64} name={adminPreviewFichier.nom_fichier} />
                    ) : adminPreviewFichier.mime_type.startsWith("image/") ? (
                      <img
                        alt={adminPreviewFichier.nom_fichier}
                        className="mx-auto max-w-full rounded-lg"
                        src={`data:${adminPreviewFichier.mime_type};base64,${adminPreviewFichier.base64}`}
                      />
                    ) : (
                      <div className="flex flex-col items-center gap-4 py-12 text-center">
                        <svg className="h-12 w-12 text-app-dark/20" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        <p className="text-sm text-app-dark/50">Apercu non disponible pour ce type de fichier.</p>
                        <button
                          className="rounded bg-app-dark px-4 py-2 text-sm text-white hover:bg-app-accent"
                          onClick={() => triggerDownload(adminPreviewFichier.base64, adminPreviewFichier.nom_fichier, adminPreviewFichier.mime_type)}
                          type="button"
                        >
                          Telecharger pour consulter
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {adminView === "feuille_redaction" ? (
              <div className="grid gap-6">
                {/* Upload form */}
                <div className="overflow-hidden rounded-2xl border border-app-muted bg-white shadow-sm">
                  <div className="flex items-center gap-3 border-b border-app-muted px-6 py-4" style={{ background: "#15173D" }}>
                    <svg className="h-4 w-4 text-white/70" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                    <p className="font-bold text-white">Partager une feuille de rédaction</p>
                  </div>
                  <div className="p-5 grid gap-3">
                    <div className="grid gap-1">
                      <label className="text-xs font-semibold uppercase tracking-wide text-app-dark/50">Titre (optionnel)</label>
                      <input
                        className="rounded-xl border border-app-muted bg-app-soft px-4 py-2.5 text-sm outline-none focus:border-app-accent focus:ring-2 focus:ring-app-accent/20"
                        placeholder="Ex : Feuille de rédaction â€” Session 2026â€¦"
                        value={feuilleRUploadTitre}
                        onChange={(e) => setFeuilleRUploadTitre(e.target.value)}
                      />
                    </div>
                    <div className="grid gap-1">
                      <label className="text-xs font-semibold uppercase tracking-wide text-app-dark/50">Fichier Word ou PDF (.doc, .docx, .pdf)</label>
                      <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-app-muted bg-app-soft px-4 py-3 transition hover:border-app-accent hover:bg-white">
                        <svg className="h-5 w-5 shrink-0 text-app-accent" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                        <span className="text-sm text-app-dark/60">{feuilleRUploadFile ? feuilleRUploadFile.name : "Choisir un fichier Word ou PDFâ€¦"}</span>
                        <input type="file" accept=".doc,.docx,.pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf" className="hidden" onChange={(e) => setFeuilleRUploadFile(e.target.files?.[0] ?? null)} />
                      </label>
                    </div>
                    <button
                      type="button"
                      disabled={!feuilleRUploadFile || feuilleRUploading}
                      onClick={() => void handleFeuilleRUpload()}
                      className="flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-40"
                      style={{ background: "#15173D" }}
                    >
                      {feuilleRUploading ? (
                        <svg className="h-4 w-4 animate-spin" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 100 16v-4l-3 3 3 3v-4a8 8 0 01-8-8z" /></svg>
                      ) : (
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                      )}
                      {feuilleRUploading ? "Envoi en coursâ€¦" : "Partager le fichier"}
                    </button>
                  </div>
                </div>

                {/* Files list */}
                <div className="overflow-hidden rounded-2xl border border-app-muted bg-white shadow-sm">
                  <div className="flex items-center justify-between border-b border-app-muted px-6 py-4" style={{ background: "#15173D" }}>
                    <p className="font-bold text-white">Fichiers partagés</p>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-white/20 px-3 py-0.5 text-xs font-bold text-white">{feuilleRFichiers.length}</span>
                      <button type="button" onClick={() => void loadFeuilleRFichiers()} className="flex items-center gap-1 rounded-lg border border-white/20 px-2.5 py-1 text-xs font-semibold text-white/80 hover:bg-white/10 transition">
                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                        Actualiser
                      </button>
                    </div>
                  </div>
                  <div className="divide-y divide-app-muted/40">
                    {feuilleRFichiers.length === 0 ? (
                      <div className="flex flex-col items-center gap-3 py-10 text-center">
                        <svg className="h-10 w-10 text-app-dark/15" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                        <p className="text-sm text-app-dark/40">Aucun fichier partagé pour le moment.</p>
                      </div>
                    ) : feuilleRFichiers.map((f) => (
                      <div key={f.id} className="flex items-center gap-4 px-5 py-3">
                        {f.nom_fichier.toLowerCase().endsWith(".pdf") ? (
                          <svg className="h-8 w-8 shrink-0 text-red-500" fill="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM6 20V4h5v7h7v9H6z"/><text x="6" y="17" fontSize="5" fill="white" fontWeight="bold">PDF</text></svg>
                        ) : (
                          <svg className="h-8 w-8 shrink-0 text-blue-500" fill="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM6 20V4h5v7h7v9H6z"/></svg>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-app-dark truncate">{f.titre}</p>
                          <p className="text-xs text-app-dark/40">{f.nom_fichier} Â· {new Date(f.uploaded_at).toLocaleDateString("fr-FR")}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {f.nom_fichier.toLowerCase().endsWith(".pdf") && (
                            <button type="button" onClick={() => void handleFeuilleRView(f.id, f.nom_fichier)} className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-100">
                              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                              Voir
                            </button>
                          )}
                          <button type="button" onClick={() => void handleFeuilleRDownload(f.id, f.nom_fichier)} className="flex items-center gap-1.5 rounded-lg border border-app-muted bg-app-soft px-3 py-1.5 text-xs font-semibold text-app-dark transition hover:bg-white">
                            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                            Télécharger
                          </button>
                          <button type="button" onClick={() => void handleFeuilleRDelete(f.id)} className="flex h-7 w-7 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-500 hover:bg-red-100 transition" title="Supprimer">
                            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            {adminView === "events" ? (
              <div className="grid gap-6">
                <PanelSection title="Events audit trail" subtitle="Suivi des operations sur la plateforme.">
                  <button
                    className="mt-3 rounded bg-app-dark px-3 py-1.5 text-xs text-white"
                    onClick={() => void loadAdminEvents()}
                    type="button"
                  >
                    Rafraichir
                  </button>
                </PanelSection>
                <SubCard title="Derniers evenements">
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-xs">
                      <thead>
                        <tr className="border-b border-app-muted text-left">
                          <th className="py-2">Date</th>
                          <th className="py-2">Actor</th>
                          <th className="py-2">Type</th>
                          <th className="py-2">Target</th>
                          <th className="py-2">Message</th>
                        </tr>
                      </thead>
                      <tbody>
                        {adminEvents.map((event) => (
                          <tr className="border-b border-app-muted/40" key={event.id}>
                            <td className="py-2">{new Date(event.created_at).toLocaleString()}</td>
                            <td className="py-2">
                              {event.actor_username || "-"}
                              {event.actor_role ? ` (${event.actor_role})` : ""}
                            </td>
                            <td className="py-2">{event.event_type}</td>
                            <td className="py-2">
                              {event.target_type || "-"} {event.target_id ? `#${event.target_id}` : ""}
                            </td>
                            <td className="py-2">{event.message || "-"}</td>
                          </tr>
                        ))}
                        {adminEvents.length === 0 ? (
                          <tr>
                            <td className="py-2 text-sm text-app-dark/70" colSpan={5}>Aucun evenement.</td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </SubCard>
              </div>
            ) : null}

            {adminView === "modules" ? (
              <div className="grid gap-5">
                {/* Breadcrumb */}
                <nav className="flex items-center gap-1.5 text-xs flex-wrap">
                  <button type="button" onClick={() => { setAdminSelectedModule(null); setAdminSelectedMatiere(null); setAdminSelectedBrochure(null); }} className={adminSelectedModule ? "text-app-dark/50 hover:text-app-dark transition" : "font-semibold text-app-dark"}>Modules</button>
                  {adminSelectedModule && (
                    <>
                      <svg className="h-3 w-3 text-app-dark/30" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                      <button type="button" onClick={() => { setAdminSelectedMatiere(null); setAdminSelectedBrochure(null); }} className={adminSelectedMatiere ? "text-app-dark/50 hover:text-app-dark transition" : "font-semibold text-app-dark"}>{adminSelectedModule.nom}</button>
                    </>
                  )}
                  {adminSelectedMatiere && (
                    <>
                      <svg className="h-3 w-3 text-app-dark/30" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                      <button type="button" onClick={() => setAdminSelectedBrochure(null)} className={adminSelectedBrochure ? "text-app-dark/50 hover:text-app-dark transition" : "font-semibold text-app-dark"}>{adminSelectedMatiere.nom}</button>
                    </>
                  )}
                  {adminSelectedBrochure && (
                    <>
                      <svg className="h-3 w-3 text-app-dark/30" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                      <span className="font-semibold text-app-dark">{adminSelectedBrochure.nom}</span>
                    </>
                  )}
                </nav>

                {adminModulesLoading ? (
                  <p className="text-sm text-app-dark/50">Chargementâ€¦</p>
                ) : adminSelectedBrochure ? (
                  /* â”€â”€ Brochure: cours list â”€â”€ */
                  <article className="rounded-2xl border border-app-muted bg-white p-6 shadow-sm">
                    <div className="flex items-center gap-3 flex-wrap mb-4">
                      <p className="text-xs font-semibold uppercase tracking-wider text-app-dark/40">Cours â€” {adminSelectedBrochure.nom}</p>
                    </div>
                    {adminSelectedBrochure.cours.length > 0 ? (
                      <div className="grid gap-3 md:grid-cols-2">
                        {adminSelectedBrochure.cours.map((c) => (
                          <div key={c.id} className="flex items-start gap-3 rounded-xl border border-app-muted bg-app-soft/40 p-4">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: "rgba(152,37,152,0.1)" }}>
                              <svg className="h-4 w-4 text-app-accent" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" /><path strokeLinecap="round" strokeLinejoin="round" d="M14 2v6h6M16 13H8M16 17H8M10 9H8" /></svg>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-sm text-app-dark leading-snug">{c.titre}</p>
                              {c.description && <p className="mt-0.5 text-xs text-app-dark/50 line-clamp-2">{c.description}</p>}
                              <p className="mt-1 text-xs text-app-dark/40">{c.instructeur}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-app-dark/40 italic">Aucun cours dans cette brochure.</p>
                    )}
                  </article>
                ) : adminSelectedMatiere ? (
                  /* â”€â”€ Matiere: brochures list â”€â”€ */
                  <article className="rounded-2xl border border-app-muted bg-white p-6 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-wider text-app-dark/40 mb-4">Brochures â€” {adminSelectedMatiere.nom}</p>
                    {adminSelectedMatiere.brochures.length > 0 ? (
                      <div className="grid gap-3 md:grid-cols-2">
                        {adminSelectedMatiere.brochures.map((b) => (
                          <button key={b.id} type="button"
                            onClick={() => {
                              apiFetch(`/api/stageaire/brochures/${b.id}/cours/`).then(async (r) => {
                                if (r.ok) { const d = await r.json(); setAdminSelectedBrochure(d); }
                              });
                            }}
                            className="group flex items-center gap-3 rounded-xl border border-app-muted bg-app-soft/40 p-4 text-left transition hover:border-app-dark/30 hover:bg-white hover:shadow-sm">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: "rgba(21,23,61,0.08)" }}>
                              <svg className="h-4 w-4 text-app-dark" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" /></svg>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-sm text-app-dark truncate">{b.nom}</p>
                              <p className="mt-0.5 text-xs text-app-dark/50">{b.cours_count} cours</p>
                            </div>
                            {b.cours_count > 0 ? (
                              <span className="shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold text-white" style={{ background: "#15173D" }}>{b.cours_count}</span>
                            ) : (
                              <span className="shrink-0 rounded-full bg-app-muted/50 px-2 py-0.5 text-xs text-app-dark/40">0</span>
                            )}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-app-dark/40 italic">Aucune brochure dans cette matière.</p>
                    )}
                  </article>
                ) : adminSelectedModule ? (
                  /* â”€â”€ Module: matieres list â”€â”€ */
                  <article className="rounded-2xl border border-app-muted bg-white p-6 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-wider text-app-dark/40 mb-4">{adminSelectedModule.nom}</p>
                    {adminSelectedModule.matieres.length > 0 ? (
                      <div className="grid gap-3 md:grid-cols-2">
                        {adminSelectedModule.matieres.map((mat) => (
                          <button key={mat.id} type="button"
                            onClick={() => {
                              apiFetch(`/api/stageaire/matieres/${mat.id}/cours/`).then(async (r) => {
                                if (r.ok) { const d = await r.json(); setAdminSelectedMatiere({ id: d.matiere_id, nom: d.matiere_nom, module_nom: d.module_nom, brochures: d.brochures ?? [], cours: d.cours }); }
                              });
                            }}
                            className="group flex items-center gap-3 rounded-xl border border-app-muted bg-app-soft/40 p-4 text-left transition hover:border-app-dark/30 hover:bg-white hover:shadow-sm">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: "rgba(152,37,152,0.1)" }}>
                              <svg className="h-4 w-4 text-app-accent" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-sm text-app-dark truncate">{mat.nom}</p>
                              <p className="mt-0.5 text-xs text-app-dark/50">{mat.cours_count} cours</p>
                            </div>
                            <svg className="h-4 w-4 shrink-0 text-app-dark/30 transition group-hover:translate-x-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-app-dark/40 italic">Aucune matière dans ce module.</p>
                    )}
                  </article>
                ) : (
                  /* â”€â”€ Modules list â”€â”€ */
                  <article className="rounded-2xl border border-app-muted bg-white p-6 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-wider text-app-dark/40 mb-4">Modules de formation</p>
                    {adminModules.length === 0 ? (
                      <p className="text-sm text-app-dark/40 italic">Aucun module disponible.</p>
                    ) : (
                      <div className="grid gap-3 md:grid-cols-2">
                        {adminModules.map((m) => (
                          <button key={m.id} type="button" onClick={() => setAdminSelectedModule(m)}
                            className="group flex items-center gap-4 rounded-xl border border-app-muted bg-app-soft/40 p-4 text-left transition hover:border-app-dark/30 hover:bg-white hover:shadow-sm">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: "#15173D" }}>
                              <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-app-dark truncate">{m.nom}</p>
                              <p className="mt-0.5 text-xs text-app-dark/50">{m.matieres.length} matière{m.matieres.length !== 1 ? "s" : ""}</p>
                            </div>
                            <svg className="h-4 w-4 shrink-0 text-app-dark/30 transition group-hover:translate-x-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                          </button>
                        ))}
                      </div>
                    )}
                  </article>
                )}
              </div>
            ) : null}

            {adminView === "classes" ? (
              <div className="grid gap-6">

                {/* â”€â”€ Créer une classe â”€â”€ */}
                <div className="overflow-hidden rounded-2xl border border-app-muted bg-white shadow-sm">
                  <div className="flex items-center gap-3 border-b border-app-muted px-5 py-4" style={{ background: "#15173D" }}>
                    <span className="text-base font-bold text-white">Créer une classe</span>
                  </div>
                  <form className="flex gap-3 p-5" onSubmit={handleCreateClass}>
                    <input
                      className="flex-1 rounded-xl border border-app-muted bg-app-soft px-4 py-2.5 text-sm outline-none focus:border-app-accent focus:ring-2 focus:ring-app-accent/20"
                      placeholder="Nom de la classe (ex : Classe Alpha)"
                      value={newClassForm.libelle}
                      onChange={(e) => setNewClassForm({ libelle: e.target.value })}
                    />
                    <button
                      className="rounded-xl px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-40"
                      style={{ background: "#982598" }}
                      type="submit"
                      disabled={!newClassForm.libelle.trim()}
                    >
                      + Créer
                    </button>
                  </form>
                </div>

                {/* â”€â”€ Gestion des affectations â”€â”€ */}
                <div className="overflow-hidden rounded-2xl border border-app-muted bg-white shadow-sm">
                  <div className="flex items-center gap-3 border-b border-app-muted px-5 py-4" style={{ background: "#15173D" }}>
                    <span className="text-base font-bold text-white">Gestion des affectations</span>
                    {selectedClassId && (
                      <span className="ml-auto rounded-full bg-white/20 px-3 py-0.5 text-xs font-semibold text-white">
                        {classesData.find((c) => c.id === selectedClassId)?.code ?? ""}
                      </span>
                    )}
                  </div>
                  <div className="p-5 grid gap-5">

                    {/* Class pill selector */}
                    <div>
                      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-app-dark/50">Sélectionner une classe</p>
                      {classesData.length === 0 ? (
                        <p className="text-sm text-app-dark/40">Aucune classe créée.</p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {classesData.map((c) => {
                            const isSelected = selectedClassId === c.id;
                            return (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() => setSelectedClassId(c.id)}
                                className="flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition"
                                style={
                                  isSelected
                                    ? { background: "#15173D", borderColor: "#15173D", color: "white" }
                                    : { background: "#F1E9E9", borderColor: "#E491C9", color: "#15173D" }
                                }
                              >
                                <span>{c.code}</span>
                                <span className="rounded-full px-1.5 py-0.5 text-[10px] font-bold" style={isSelected ? { background: "rgba(255,255,255,0.2)" } : { background: "#E491C9", color: "#15173D" }}>
                                  {c.brigade.code}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Two columns: Stagiaires | Instructeurs */}
                    <div className="grid gap-4 md:grid-cols-2">

                      {/* â”€â”€ Stagiaires multi-select â”€â”€ */}
                      {(() => {
                        const allStags = adminData.users.filter((u) => u.role === "Stagiaire");
                        const filteredStags = allStags.filter((u) => u.username.toLowerCase().includes(stagSearch.toLowerCase()));
                        const allChecked = filteredStags.length > 0 && filteredStags.every((u) => selectedStageaireIds.includes(u.id));
                        return (
                          <div className="flex flex-col rounded-xl border border-app-muted overflow-hidden">
                            {/* Header */}
                            <div className="flex items-center justify-between px-4 py-3 border-b border-app-muted" style={{ background: "#F1E9E9" }}>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-app-dark">Stagiaires</span>
                                <span className="rounded-full bg-app-accent px-2 py-0.5 text-[10px] font-bold text-white">{selectedStageaireIds.length}/{allStags.length}</span>
                              </div>
                              <button
                                type="button"
                                className="text-xs font-semibold text-app-accent"
                                onClick={() =>
                                  allChecked
                                    ? setSelectedStageaireIds((prev) => prev.filter((id) => !filteredStags.some((u) => u.id === id)))
                                    : setSelectedStageaireIds((prev) => [...new Set([...prev, ...filteredStags.map((u) => u.id)])])
                                }
                              >
                                {allChecked ? "Désélectionner tout" : "Tout sélectionner"}
                              </button>
                            </div>
                            {/* Search */}
                            <div className="flex items-center gap-2 border-b border-app-muted px-3 py-2 bg-white">
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 shrink-0 text-app-dark/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                              </svg>
                              <input
                                className="w-full bg-transparent text-xs outline-none placeholder:text-app-dark/30"
                                placeholder="Rechercher stagiaireâ€¦"
                                value={stagSearch}
                                onChange={(e) => setStagSearch(e.target.value)}
                              />
                              {stagSearch && <button type="button" className="text-app-dark/30 hover:text-app-dark text-xs" onClick={() => setStagSearch("")}>âœ•</button>}
                            </div>
                            {/* List */}
                            <div className="max-h-52 overflow-y-auto bg-white divide-y divide-app-muted/30">
                              {filteredStags.length === 0 && <p className="px-4 py-3 text-xs text-app-dark/40">Aucun stagiaire{stagSearch ? ` pour « ${stagSearch} »` : ""}.</p>}
                              {filteredStags.map((u) => {
                                const checked = selectedStageaireIds.includes(u.id);
                                return (
                                  <label key={`stag-sel-${u.id}`} className={`flex cursor-pointer items-center gap-3 px-4 py-2.5 transition ${checked ? "bg-app-soft" : "hover:bg-app-soft/60"}`}>
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      className="h-4 w-4 rounded accent-app-accent"
                                      onChange={() => setSelectedStageaireIds((prev) => checked ? prev.filter((id) => id !== u.id) : [...prev, u.id])}
                                    />
                                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: "#982598" }}>
                                      {u.username[0]?.toUpperCase()}
                                    </div>
                                    <span className="flex-1 text-xs font-medium text-app-dark">{u.username}</span>
                                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${u.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-500"}`}>
                                      {u.is_active ? "Actif" : "Inactif"}
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                            {/* Footer */}
                            <div className="border-t border-app-muted px-4 py-3 bg-white">
                              <button
                                type="button"
                                className="w-full rounded-lg py-2 text-sm font-bold text-white transition disabled:opacity-40"
                                style={{ background: "#982598" }}
                                disabled={selectedStageaireIds.length === 0 || !selectedClassId}
                                onClick={() => void handleAssignStageaireToClass()}
                              >
                                Assigner {selectedStageaireIds.length > 0 ? `${selectedStageaireIds.length} stagiaire(s)` : "stagiaires"}
                              </button>
                            </div>
                          </div>
                        );
                      })()}

                      {/* â”€â”€ Instructeurs multi-select â”€â”€ */}
                      {(() => {
                        const allInstrs = adminData.users.filter((u) => u.role === "Instructeur");
                        const filteredInstrs = allInstrs.filter((u) => u.username.toLowerCase().includes(instrSearch.toLowerCase()));
                        const allChecked = filteredInstrs.length > 0 && filteredInstrs.every((u) => selectedInstructeurIds.includes(u.id));
                        return (
                          <div className="flex flex-col rounded-xl border border-app-muted overflow-hidden">
                            {/* Header */}
                            <div className="flex items-center justify-between px-4 py-3 border-b border-app-muted" style={{ background: "#F1E9E9" }}>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-app-dark">Instructeurs</span>
                                <span className="rounded-full bg-app-accent px-2 py-0.5 text-[10px] font-bold text-white">{selectedInstructeurIds.length}/{allInstrs.length}</span>
                              </div>
                              <button
                                type="button"
                                className="text-xs font-semibold text-app-accent"
                                onClick={() =>
                                  allChecked
                                    ? setSelectedInstructeurIds((prev) => prev.filter((id) => !filteredInstrs.some((u) => u.id === id)))
                                    : setSelectedInstructeurIds((prev) => [...new Set([...prev, ...filteredInstrs.map((u) => u.id)])])
                                }
                              >
                                {allChecked ? "Désélectionner tout" : "Tout sélectionner"}
                              </button>
                            </div>
                            {/* Search */}
                            <div className="flex items-center gap-2 border-b border-app-muted px-3 py-2 bg-white">
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 shrink-0 text-app-dark/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                              </svg>
                              <input
                                className="w-full bg-transparent text-xs outline-none placeholder:text-app-dark/30"
                                placeholder="Rechercher instructeurâ€¦"
                                value={instrSearch}
                                onChange={(e) => setInstrSearch(e.target.value)}
                              />
                              {instrSearch && <button type="button" className="text-app-dark/30 hover:text-app-dark text-xs" onClick={() => setInstrSearch("")}>âœ•</button>}
                            </div>
                            {/* List */}
                            <div className="max-h-52 overflow-y-auto bg-white divide-y divide-app-muted/30">
                              {filteredInstrs.length === 0 && <p className="px-4 py-3 text-xs text-app-dark/40">Aucun instructeur{instrSearch ? ` pour « ${instrSearch} »` : ""}.</p>}
                              {filteredInstrs.map((u) => {
                                const checked = selectedInstructeurIds.includes(u.id);
                                return (
                                  <label key={`instr-sel-${u.id}`} className={`flex cursor-pointer items-center gap-3 px-4 py-2.5 transition ${checked ? "bg-app-soft" : "hover:bg-app-soft/60"}`}>
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      className="h-4 w-4 rounded accent-app-accent"
                                      onChange={() => setSelectedInstructeurIds((prev) => checked ? prev.filter((id) => id !== u.id) : [...prev, u.id])}
                                    />
                                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: "#982598" }}>
                                      {u.username[0]?.toUpperCase()}
                                    </div>
                                    <span className="flex-1 text-xs font-medium text-app-dark">{u.username}</span>
                                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${u.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-500"}`}>
                                      {u.is_active ? "Actif" : "Inactif"}
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                            {/* Footer */}
                            <div className="border-t border-app-muted px-4 py-3 bg-white">
                              <button
                                type="button"
                                className="w-full rounded-lg py-2 text-sm font-bold text-white transition disabled:opacity-40"
                                style={{ background: "#982598" }}
                                disabled={selectedInstructeurIds.length === 0 || !selectedClassId}
                                onClick={() => void handleAssignInstructeurToClass()}
                              >
                                Assigner {selectedInstructeurIds.length > 0 ? `${selectedInstructeurIds.length} instructeur(s)` : "instructeurs"}
                              </button>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>

                {/* â”€â”€ Liste des classes â”€â”€ */}
                <div className="overflow-hidden rounded-2xl border border-app-muted bg-white shadow-sm">
                  <div className="flex items-center justify-between border-b border-app-muted px-5 py-4" style={{ background: "#15173D" }}>
                    <span className="text-base font-bold text-white">Classes créées</span>
                    <span className="rounded-full bg-white/20 px-3 py-0.5 text-xs font-bold text-white">{classesData.length}</span>
                  </div>
                  <div className="p-5 grid gap-4 md:grid-cols-2">
                    {classesData.length === 0 && <p className="col-span-2 py-6 text-center text-sm text-app-dark/40">Aucune classe créée.</p>}
                    {classesData.map((c) => (
                      <div
                        key={c.id}
                        className={`rounded-xl border-2 p-4 transition ${selectedClassId === c.id ? "border-app-accent bg-app-soft" : "border-app-muted bg-white"}`}
                      >
                        {/* Class header */}
                        <div className="flex items-start justify-between mb-3 gap-2">
                          <button
                            type="button"
                            className="flex-1 text-left"
                            onClick={() => setSelectedClassId(c.id)}
                          >
                            <p className="text-sm font-bold text-app-dark">{c.code} â€” {c.label}</p>
                            <p className="text-xs text-app-dark/50">Brigade : {c.brigade.code}{c.brigade.label ? ` Â· ${c.brigade.label}` : ""}</p>
                          </button>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="rounded-full bg-app-soft border border-app-muted px-2 py-0.5 text-[10px] font-semibold text-app-dark/60">{c.stageaires.length} stag.</span>
                            <span className="rounded-full bg-app-soft border border-app-muted px-2 py-0.5 text-[10px] font-semibold text-app-dark/60">{c.instructeurs.length} instr.</span>
                            {/* Delete class button */}
                            <button
                              type="button"
                              title="Supprimer la classe"
                              className="flex h-7 w-7 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-xs text-red-500 transition hover:bg-red-100 hover:text-red-700"
                              onClick={async () => {
                                if (!confirm(`Supprimer la classe « ${c.label} » ?`)) return;
                                await apiFetch(`/api/admin/classes/${c.id}/delete/`, { method: "DELETE" });
                                if (selectedClassId === c.id) setSelectedClassId("");
                                await loadClasses();
                              }}
                            >
                              ðŸ—‘
                            </button>
                          </div>
                        </div>

                        {/* Members */}
                        <div className="space-y-2">
                          {/* Instructeurs */}
                          <div>
                            <p className="text-[10px] uppercase tracking-wide font-bold text-app-dark/40 mb-1">Instructeurs</p>
                            {c.instructeurs.length === 0 ? (
                              <p className="text-xs text-app-dark/30 italic">Aucun</p>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {c.instructeurs.map((i) => (
                                  <span key={`instr-${i.id ?? i.username}`} className="flex items-center gap-1 rounded-full border border-app-muted bg-white pl-1 pr-1.5 py-0.5 text-[11px] font-medium text-app-dark">
                                    <span className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold text-white" style={{ background: "#982598" }}>{i.username[0]?.toUpperCase()}</span>
                                    {i.username}
                                    <button
                                      type="button"
                                      title="Retirer"
                                      className="ml-0.5 text-red-400 hover:text-red-600 leading-none"
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        await apiFetch(`/api/admin/classes/${c.id}/remove-instructeur/`, {
                                          method: "POST",
                                          headers: { "Content-Type": "application/json" },
                                          body: JSON.stringify({ instructeur_id: i.id }),
                                        });
                                        await loadClasses();
                                      }}
                                    >
                                      âœ•
                                    </button>
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Stagiaires */}
                          <div>
                            <p className="text-[10px] uppercase tracking-wide font-bold text-app-dark/40 mb-1">Stagiaires</p>
                            {c.stageaires.length === 0 ? (
                              <p className="text-xs text-app-dark/30 italic">Aucun</p>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {c.stageaires.slice(0, 8).map((s) => (
                                  <span key={`stag-${s.id ?? s.username}`} className="flex items-center gap-1 rounded-full border border-app-muted bg-white pl-1 pr-1.5 py-0.5 text-[11px] font-medium text-app-dark">
                                    <span className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold text-white" style={{ background: "#15173D" }}>{s.username[0]?.toUpperCase()}</span>
                                    {s.username}
                                    <button
                                      type="button"
                                      title="Retirer"
                                      className="ml-0.5 text-red-400 hover:text-red-600 leading-none"
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        await apiFetch(`/api/admin/classes/${c.id}/remove-stageaire/`, {
                                          method: "POST",
                                          headers: { "Content-Type": "application/json" },
                                          body: JSON.stringify({ stageaire_id: s.id }),
                                        });
                                        await loadClasses();
                                      }}
                                    >
                                      âœ•
                                    </button>
                                  </span>
                                ))}
                                {c.stageaires.length > 8 && (
                                  <span className="rounded-full border border-app-muted bg-app-soft px-2 py-0.5 text-[11px] text-app-dark/50">+{c.stageaires.length - 8}</span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            ) : null}
          </article>
        </section>
      ) : null}

      {renameModal.open ? (
        <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4">
          <div className="modal-panel w-full max-w-md rounded-xl border border-app-muted bg-white p-4 shadow-2xl">
            <h3 className="text-lg font-semibold">
              {renameModal.target === "corps" ? "Modifier le corps" : renameModal.target === "rank" ? "Modifier le grade" : "Modifier la spécialité"}
            </h3>
            <form className="mt-3 grid gap-3" onSubmit={handleSubmitRename}>
              <Input label="Code" value={renameModal.code} onChange={(code) => setRenameModal((prev) => ({ ...prev, code }))} />
              <Input label="Libellé" value={renameModal.value} onChange={(value) => setRenameModal((prev) => ({ ...prev, value }))} />
              {(renameModal.target === "rank" || renameModal.target === "speciality") && referencesData ? (
                <label className="grid gap-1 text-sm font-medium text-app-dark">
                  Corps{renameModal.target === "speciality" ? " (optionnel)" : ""}
                  <select
                    className="rounded border border-app-muted bg-white px-3 py-2"
                    value={renameModal.corps_id}
                    onChange={(e) => setRenameModal((prev) => ({ ...prev, corps_id: e.target.value }))}
                  >
                    {renameModal.target === "speciality" && <option value="">â€” aucun â€”</option>}
                    {referencesData.corps.map((c) => (
                      <option key={c.id} value={c.id}>{c.label}</option>
                    ))}
                  </select>
                </label>
              ) : null}
              <div className="flex justify-end gap-2">
                <button
                  className="rounded border border-app-muted px-3 py-2 text-sm"
                  onClick={() => setRenameModal({ open: false, target: null, id: "", value: "", code: "", corps_id: "" })}
                  type="button"
                >
                  Annuler
                </button>
                <button className="rounded bg-app-dark px-3 py-2 text-sm font-semibold text-white" type="submit">
                  Enregistrer
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
  required = true,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "password";
  required?: boolean;
}) {
  return (
    <TextField
      fullWidth
      label={label}
      onChange={(event) => onChange(event.target.value)}
      required={required}
      size="small"
      type={type}
      value={value}
      variant="outlined"
    />
  );
}

function AppShell() {
  const { t } = useTranslation();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(localStorage.getItem(ACCESS_TOKEN_KEY));
  const [refreshToken, setRefreshToken] = useState<string | null>(localStorage.getItem(REFRESH_TOKEN_KEY));
  const [user, setUser] = useState<MeResponse | null>(null);
  const [publicReferences, setPublicReferences] = useState<{
    corps: ReferenceCorp[];
    ranks: ReferenceRank[];
    specialities: ReferenceSpeciality[];
  }>({ corps: [], ranks: [], specialities: [] });

  const clearSession = () => {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    setAccessToken(null);
    setRefreshToken(null);
    setUser(null);
  };

  const refreshAccessToken = async () => {
    if (!refreshToken) return null;
    const response = await fetch(`${API_BASE_URL}/api/token/refresh/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh: refreshToken }),
    });

    if (!response.ok) {
      clearSession();
      setError(t("errors.sessionExpired"));
      return null;
    }

    const data: RefreshResponse = await response.json();
    localStorage.setItem(ACCESS_TOKEN_KEY, data.access);
    setAccessToken(data.access);
    return data.access;
  };

  /* eslint-disable react-hooks/preserve-manual-memoization */
  const loadProfile = useCallback(
    async (tokenOverride?: string) => {
      const token = tokenOverride ?? accessToken;
      if (!token) return;
      let response = await fetch(`${API_BASE_URL}/api/me/`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.status === 401) {
        const newAccessToken = await refreshAccessToken();
        if (!newAccessToken) return;
        response = await fetch(`${API_BASE_URL}/api/me/`, {
          headers: { Authorization: `Bearer ${newAccessToken}` },
        });
      }

      if (!response.ok) {
        setError(t("errors.profileLoadFailed"));
        return;
      }

      const data: MeResponse = await response.json();
      setUser(data);
    },
    [accessToken, refreshToken, t],
  );
  /* eslint-enable react-hooks/preserve-manual-memoization */

  const apiFetch = async (path: string, init?: RequestInit) => {
    if (!accessToken) {
      return new Response(null, { status: 401 });
    }

    const withAuth: RequestInit = {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        Authorization: `Bearer ${accessToken}`,
      },
    };
    let response = await fetch(`${API_BASE_URL}${path}`, withAuth);
    if (response.status !== 401) return response;

    const newAccessToken = await refreshAccessToken();
    if (!newAccessToken) return response;

    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        Authorization: `Bearer ${newAccessToken}`,
      },
    });
    return response;
  };

  const login = async (username: string, password: string) => {
    setError(null);
    const response = await fetch(`${API_BASE_URL}/api/token/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    if (!response.ok) {
      setError(t("errors.invalidCredentials"));
      throw new Error("Invalid credentials");
    }

    const tokens: TokenResponse = await response.json();
    localStorage.setItem(ACCESS_TOKEN_KEY, tokens.access);
    localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refresh);
    setAccessToken(tokens.access);
    setRefreshToken(tokens.refresh);
    await loadProfile(tokens.access);
  };

  const signup = async (payload: {
    username: string;
    password: string;
    email: string;
    role: Role;
    matricule: string;
    est_civil: boolean;
    corps_id: string;
  }) => {
    setError(null);
    const response = await fetch(`${API_BASE_URL}/api/signup/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      let detail = "";
      try {
        const errorPayload: { detail?: string } = await response.json();
        detail = errorPayload.detail ?? "";
      } catch {
        // keep default fallback below
      }
      if (detail === "matricule is required for military roles") {
        setError(t("errors.matriculeRequired"));
      } else {
        setError(t("errors.signupFailed"));
      }
      throw new Error("Signup failed");
    }

    await login(payload.username, payload.password);
  };

  useEffect(() => {
    const loadPublicReferences = async () => {
      const response = await fetch(`${API_BASE_URL}/api/references/`);
      if (!response.ok) return;
      const data: { corps: ReferenceCorp[]; ranks: ReferenceRank[]; specialities: ReferenceSpeciality[] } = await response.json();
      setPublicReferences(data);
    };
    void loadPublicReferences();
  }, []);

  useEffect(() => {
    if (!refreshToken) return;
    const timer = window.setInterval(() => {
      void refreshAccessToken();
    }, 4 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [refreshToken]);

  useEffect(() => {
    if (!accessToken) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadProfile();
  }, [accessToken, loadProfile]);

  useEffect(() => {
    if (location.pathname === "/") {
      document.title = `${t("titles.home")} - ${t("titles.appName")}`;
      return;
    }
    if (location.pathname === "/login") {
      document.title = `${t("titles.login")} - ${t("titles.appName")}`;
      return;
    }
    if (location.pathname === "/signup") {
      document.title = `${t("titles.signup")} - ${t("titles.appName")}`;
      return;
    }
    if (location.pathname === "/dashboard") {
      document.title = `${t("titles.dashboard")} - ${t("titles.appName")}`;
      return;
    }
    if (location.pathname !== "/dashboard") {
      document.title = t("titles.appName");
    }
  }, [location.pathname, user?.role, t]);

  return (
    <Layout user={user} onLogout={clearSession}>
      <div className="route-transition" key={location.pathname}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/dashboard" element={<DashboardPage onLoadProfile={loadProfile} user={user} apiFetch={apiFetch} onSessionInvalid={clearSession} />} />
          <Route path="/login" element={<LoginPage error={error} onLogin={login} />} />
          <Route path="/signup" element={<SignupPage error={error} onSignup={signup} references={publicReferences} />} />
          <Route path="*" element={<Navigate replace to="/" />} />
        </Routes>
      </div>
    </Layout>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}

export default App;










