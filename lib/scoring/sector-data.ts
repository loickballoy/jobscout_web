/**
 * Données de la classification par secteur d'employeur (lib/scoring/sector.ts).
 * Sans dépendance serveur. Les noms sont comparés après normalisation (companyKey) :
 * casse, accents, ponctuation et formes juridiques n'y comptent pas.
 */

/** Banques, infrastructures de marché, gestion d'actifs, éditeurs financiers, paiement, négoce. */
export const FINANCE_COMPANIES: string[] = [
  // France
  "BNP Paribas", "Société Générale", "Crédit Agricole", "Crédit Agricole CIB", "CACIB", "Natixis", "BPCE",
  "Crédit Mutuel", "CIC", "LCL", "La Banque Postale", "Banque de France", "Caisse d'Epargne", "Banque Populaire",
  "HSBC", "Oddo BHF", "Rothschild", "Lazard", "Exane", "Edmond de Rothschild", "Amundi", "Lyxor", "Natixis Investment Managers",
  "AXA Investment Managers", "Tikehau", "Ardian", "Capital Fund Management", "CACEIS", "Boursorama", "Crédit du Nord",
  "Banque Palatine", "Bpifrance", "Caisse des Dépôts",
  // Suisse
  "UBS", "Credit Suisse", "Julius Baer", "Julius Bär", "Pictet", "Lombard Odier", "UBP", "Union Bancaire Privée",
  "BCGE", "Banque Cantonale de Genève", "BCV", "Banque Cantonale Vaudoise", "ZKB", "Zürcher Kantonalbank", "Raiffeisen",
  "PostFinance", "Vontobel", "EFG", "EFG International", "Mirabaud", "Banque Syz", "J. Safra Sarasin", "Bordier",
  "Piguet Galland", "Swissquote", "Banque nationale suisse", "BNS", "SNB", "Banque Cantonale Neuchâteloise", "BCF",
  "Banque Cantonale de Fribourg", "Banque Cantonale du Valais", "Reyl", "Gonet",
  // Benelux
  "BGL BNP Paribas", "Spuerkeess", "BCEE", "Banque Internationale à Luxembourg", "BIL", "Banque de Luxembourg",
  "ING", "ABN AMRO", "Rabobank", "KBC", "Belfius", "BNP Paribas Fortis", "Degroof Petercam", "Triodos", "de Volksbank",
  // Banques et gestion internationales
  "Goldman Sachs", "J.P. Morgan", "JPMorgan", "JPMorgan Chase", "Morgan Stanley", "Citi", "Citigroup", "Barclays",
  "Deutsche Bank", "BlackRock", "State Street", "Northern Trust", "Nomura", "Mizuho", "MUFG", "Santander", "Standard Chartered",
  // Infrastructures de marché
  "Euronext", "SIX", "SIX Group", "Euroclear", "Clearstream", "LCH", "Deutsche Börse", "SWIFT",
  // Éditeurs financiers
  "Murex", "Temenos", "Avaloq", "Finastra", "Calypso", "Adenza", "Linedata", "Sopra Banking Software", "Finaxys",
  // Paiement et fintech
  "Adyen", "Worldline", "Ingenico", "Stripe", "Mollie", "Lydia", "Qonto", "Swan", "Payplug", "Nexi", "SumUp", "Revolut",
  // Négoce et trading
  "Trafigura", "Vitol", "Gunvor", "Mercuria", "Optiver", "IMC Trading", "Flow Traders", "Jane Street", "Citadel", "Squarepoint",
];

/** ESN, cabinets de conseil et Big 4. */
export const CONSEIL_COMPANIES: string[] = [
  "Capgemini", "Capgemini Engineering", "Capgemini Invent", "Sopra Steria", "Accenture", "CGI", "Atos", "Eviden", "Inetum",
  "Alten", "Akkodis", "Expleo", "Devoteam", "Wavestone", "Sia Partners", "Onepoint", "Talan", "SII", "Deloitte", "PwC",
  "PricewaterhouseCoopers", "EY", "Ernst & Young", "KPMG", "Forvis Mazars", "Mazars", "Ordina", "Cegeka", "NRB", "ELCA",
  "Zühlke", "Adnovum", "Netcetera", "IBM Consulting", "Avanade", "Infosys", "TCS", "Tata Consultancy Services", "Cognizant", "Wipro",
];

/**
 * Mots-clés pondérés (français, anglais, néerlandais). Poids 3 : marqueur net du
 * secteur ; 2 : fréquent dans le secteur ; 1 : indice seulement (« paiement » se
 * lit aussi dans le commerce en ligne). Présent dans l'intitulé : poids doublé.
 */
export const FINANCE_KEYWORDS: [term: string, weight: number][] = [
  ["banque", 3], ["bancaire", 3], ["bank", 3], ["banking", 3], ["gestion d'actifs", 3], ["asset management", 3],
  ["wealth management", 3], ["gestion de fortune", 3], ["banque privee", 3], ["private banking", 3],
  ["marches financiers", 3], ["capital markets", 3], ["salle des marches", 3], ["fintech", 3],
  ["reglement-livraison", 3], ["custody", 3], ["vermogensbeheer", 3],
  ["trading", 2], ["front office", 2], ["middle office", 2], ["payments", 2], ["betalingen", 2],
  ["paiement", 1], ["back office", 1], ["compensation", 1], ["conservation", 1],
];

export const CONSEIL_KEYWORDS: [term: string, weight: number][] = [
  ["esn", 3], ["entreprise de services du numerique", 3], ["ssii", 3], ["cabinet de conseil", 3], ["societe de conseil", 3],
  ["chez nos clients", 3], ["mission chez un client", 3], ["adviesbureau", 3], ["detachering", 3], ["it-dienstverlener", 3],
  ["consulting", 2], ["consultant", 2], ["integrateur", 2],
  ["nos clients", 1],
];
