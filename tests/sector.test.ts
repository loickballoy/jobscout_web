import { describe, expect, it } from "vitest";
import { classifySector, companyKey, type KnownCompany } from "@/lib/scoring/sector";

const c = (company: string, title: string, description = "") => classifySector({ company, title, description });

describe("secteur de l'employeur", () => {
  it("banque privée suisse (nom connu)", () => {
    expect(c("Banque Pictet & Cie SA", "Software Engineer", "Développement d'applications internes.")).toMatchObject({ sector: "finance", reason: "Nom connu : banque ou finance" });
  });

  it("banque d'investissement parisienne (mots-clés)", () => {
    expect(c("Banque Exemple Paris", "Développeur C++ front office", "Rejoignez notre salle des marchés : outils de pricing pour les traders.").sector).toBe("finance");
  });

  it("banque luxembourgeoise (nom connu)", () => {
    expect(c("Banque Internationale à Luxembourg", "Data Engineer").sector).toBe("finance");
    expect(c("Spuerkeess", "Développeur Java").sector).toBe("finance");
  });

  it("infrastructure de marché : Euroclear", () => {
    expect(c("Euroclear Bank SA/NV", "Graduate Software Engineer").sector).toBe("finance");
  });

  it("éditeur financier", () => {
    expect(c("Temenos Headquarters SA", "Développeur Java").sector).toBe("finance");
  });

  it("ESN française", () => {
    expect(c("Capgemini Technology Services", "Ingénieur développement Python").sector).toBe("conseil");
  });

  it("Big 4", () => {
    expect(c("Ernst & Young Advisory", "Consultant Data").sector).toBe("conseil");
    expect(c("KPMG S.A.", "Auditeur IT").sector).toBe("conseil");
  });

  it("ESN en mission bancaire : reste conseil", () => {
    const r = c(
      "ESN Démo",
      "Développeur Java H/F",
      "ESN en forte croissance, nous recherchons pour notre client, une grande banque, un développeur Java pour son back office. Mission chez un client du secteur bancaire."
    );
    expect(r.sector).toBe("conseil");
    expect(r.reason).toMatch(/^Mots-clés : /);
  });

  it("offre en néerlandais", () => {
    expect(c("Demo Vermogensbeheer BV", "Software ontwikkelaar", "Wij zijn een vermogensbeheer specialist voor betalingen en beleggingen.").sector).toBe("finance");
    expect(c("Demo IT", "Java developer", "Als IT-dienstverlener werken wij met detachering bij klanten.").sector).toBe("conseil");
  });

  it("industriel automobile : autre", () => {
    expect(c("Constructeur Auto Démo", "Ingénieur logiciel embarqué", "Développement de calculateurs moteur, bancs d'essais, CAN.").sector).toBe("autre");
  });

  it("start-up hors finance : autre", () => {
    expect(c("Start-up Démo", "Développeur React", "Plateforme de réservation de salles de sport. Paiement en ligne intégré.")).toMatchObject({ sector: "autre" });
  });

  it("assureur seul : autre", () => {
    expect(c("Assurances Démo", "Développeur Python", "Leader de l'assurance santé et prévoyance, nous protégeons nos assurés.").sector).toBe("autre");
  });

  it("cible importée : l'emporte sur les mots-clés", () => {
    const targets: KnownCompany[] = [{ key: companyKey("Banque Exemple SA"), sector: "finance" }];
    const r = classifySector({ company: "Banque Exemple", title: "Consultant", description: "ESN, chez nos clients, cabinet de conseil." }, targets);
    expect(r).toEqual({ sector: "finance", reason: "Entreprise cible" });
    // Nom de cible contenu dans celui de l'offre.
    expect(classifySector({ company: "Banque Exemple Genève", title: "Dev", description: "" }, targets).sector).toBe("finance");
  });

  it("normalisation du nom : formes juridiques, accents, ponctuation", () => {
    expect(companyKey("Banque Exemple S.A.")).toBe("banque exemple");
    expect(companyKey("ÉSN Démo SAS")).toBe("esn demo");
    expect(companyKey("Zürcher Kantonalbank AG")).toBe("zurcher kantonalbank");
    expect(companyKey("Jean Test Holding GmbH")).toBe("jean test");
    expect(companyKey("  ")).toBe("");
    expect(companyKey(null)).toBe("");
  });

  it("description vide : décision sur l'intitulé seul", () => {
    expect(c("", "Développeur banque privée", "").sector).toBe("finance");
    expect(c("", "Développeur web", "")).toEqual({ sector: "autre", reason: "Aucun indice de banque ou de conseil" });
  });

  it("un mot sans rapport ne déclenche rien (« banques » au pluriel oui, « back-office » web seul non)", () => {
    expect(c("Agence Web Démo", "Développeur back-office PHP", "Création du back-office d'un site e-commerce.").sector).toBe("autre");
    expect(c("Démo", "Développeur", "Nous travaillons pour des banques et des assureurs.").sector).toBe("finance");
  });

  it("nom court connu reconnu comme mot entier seulement", () => {
    expect(c("ING Belgique", "Développeur").sector).toBe("finance");
    expect(c("Ingénierie Démo", "Développeur").sector).toBe("autre");
    expect(c("SII Lyon", "Ingénieur").sector).toBe("conseil");
  });
});
