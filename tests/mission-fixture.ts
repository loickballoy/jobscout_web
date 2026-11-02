/** Pack de Mission fictif (aucune donnée réelle) : plan sur deux phases, gel, habitudes, tâches, cibles. */
export function demoPack() {
  return {
    type: "jobscout-mission-pack",
    version: 1,
    brief: "# Mission démo\n\nTrouver un poste de **développeur** junior.",
    plan: {
      start: "2026-11-02",
      offer_deadline: "2027-01-31",
      start_target: "2027-02-01",
      budget_minutes: { mon: 180, tue: 180, wed: 180, thu: 180, fri: 180, sat: 480, sun: 300 },
      freeze: { from: "2026-12-19", to: "2027-01-04", note: "Recrutement à l'arrêt : préparation uniquement." },
      phases: [
        { id: "P1", label: "Vitrine", from: "2026-11-02", to: "2026-11-08" },
        { id: "P2", label: "Vague 1", from: "2026-11-09", to: "2026-12-18" },
        { id: "P3", label: "Gel", from: "2026-12-19", to: "2027-01-04" },
        { id: "P4", label: "Closing", from: "2027-01-05", to: "2027-01-31" },
      ],
      habits: [
        { id: "H-ALGO", title: "Algo : un problème chronométré", minutes: 60, days: ["mon", "tue", "wed", "thu", "fri", "sat"], from: "2026-11-09", to: "2027-01-31", category: "entretien" },
        { id: "H-CAND", title: "Une candidature ciblée complète", minutes: 60, days: ["mon", "tue", "wed", "thu", "fri"], from: "2026-11-09", to: "2027-01-31", category: "candidature" },
        { id: "H-SOIR", title: "Débrief du soir", minutes: 10, days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], from: "2026-11-02", to: "2027-01-31", category: "admin" },
      ],
      kpi_weekly: { candidatures_ciblees: 5, messages_nommes: 5, mock_interviews: 1 },
      diagnostic: { min_candidatures: 10, min_response_rate: 0.1 },
    },
    tasks: [
      { id: "T-01", phase: "P1", title: "Rendre public le projet démo", minutes: 60, window: ["2026-11-02", "2026-11-03"], priority: 1, category: "github" },
      { id: "T-02", phase: "P1", title: "Demander une recommandation", minutes: 15, window: ["2026-11-02", "2026-11-06"], priority: 1, category: "admin" },
      { id: "T-03", phase: "P1", title: "Mettre à jour le profil", minutes: 45, window: ["2026-11-03", "2026-11-05"], priority: 2, category: "vitrine" },
      { id: "T-04", phase: "P1", title: "Relire le CV", minutes: 90, window: ["2026-11-06", "2026-11-08"], priority: 1, category: "cv" },
      { id: "T-05", phase: "P2", title: "Préparer cinq histoires STAR", minutes: 120, window: ["2026-11-09", "2026-11-15"], priority: 2, category: "entretien" },
    ],
    targets: [
      { company: "Banque Exemple SA", city: "Genève", country: "CH", sector: "finance", type: "Banque privée", tier: "A", cv: "F", angle: "Systèmes fiables", contact: "", status: "a_verifier", next: "" },
      { company: "ESN Démo", city: "Paris", country: "FR", sector: "conseil", type: "ESN", tier: "B", cv: "E", angle: "", contact: "", status: "a_contacter", next: "Trouver un contact" },
    ],
    audit: {
      forbidden_terms: [{ cluster: "F", terms: ["mot interdit"] }],
      manual: [{ id: "linkedin", label: "Profil LinkedIn à jour" }],
    },
  };
}
