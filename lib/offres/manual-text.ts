// Ajout manuel d'une offre — partie sans dépendance serveur (formulaire et API).

export type ManualDraft = {
  url: string;
  title: string;
  company: string;
  location: string;
  country: string;
  contract_type: string;
  salary: string;
  posted_at: string;
  description_text: string;
  /** HTML d'origine (lien) : conservé si le texte n'a pas été modifié. */
  description_html: string;
};

/**
 * Texte collé sans titre : la première ligne courte sert d'intitulé ;
 * « Entreprise : X », « Lieu : Y », « Contrat : Z » sont repris s'ils sont écrits.
 */
export function guessFromText(text: string): Pick<ManualDraft, "title" | "company" | "location" | "contract_type"> {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const field = (re: RegExp) => {
    for (const l of lines.slice(0, 40)) {
      const m = re.exec(l);
      if (m && m[1].trim().length <= 80) return m[1].trim();
    }
    return "";
  };
  const first = lines.find((l) => l.length >= 3 && l.length <= 120) ?? "";
  return {
    title: first,
    company: field(/^(?:entreprise|société|societe|company|employeur|employer)\s*:\s*(.+)$/i),
    location: field(/^(?:lieu|localisation|location|ville|lieu de travail|workplace)\s*:\s*(.+)$/i),
    contract_type: field(/^(?:contrat|type de contrat|contract|employment type)\s*:\s*(.+)$/i),
  };
}
