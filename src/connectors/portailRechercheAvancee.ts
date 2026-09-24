import * as cheerio from "cheerio";
import type { RechercheRegistreQuery, RegistreTrouve, TypeActe } from "../types.js";
import type { DepartementConnector } from "./types.js";

/**
 * Connecteur pour la famille de portails d'archives départementales qui exposent
 * un formulaire de recherche avancée à l'URL /search/form/<uuid> et des résultats
 * à /search/results (vu chez le Nord et la Marne). Le formulaire est analysé à
 * chaque recherche : les noms de champs et la liste des communes valides varient
 * d'un département à l'autre et ne sont pas garantis stables dans le temps.
 */

export interface ConfigPortailRechercheAvancee {
  code: string;
  nom: string;
  baseUrl: string;
  formUuid: string;
}

export interface ChampsFormulaire {
  commune: string;
  typeActe?: string;
  dateExacte?: string;
  dateDebut?: string;
  dateFin?: string;
  optionsCommune: string[];
  optionsTypeActe: string[];
}

export type RecupererPage = (url: string) => Promise<string>;

const MOTS_CLES_TYPE_ACTE: Record<TypeActe, string[]> = {
  naissance: ["naissance", "baptem"],
  mariage: ["mariage"],
  deces: ["deces", "sepulture"],
  table_decennale: ["decennale"],
};

const MOTS_EXCLUS_TYPE_ACTE: Record<TypeActe, string[]> = {
  naissance: [],
  mariage: ["publication"],
  deces: [],
  table_decennale: [],
};

function normaliser(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

function nomBase(optionCommune: string): string {
  return optionCommune.split("(")[0]?.trim() ?? optionCommune;
}

export function analyserFormulaire(html: string): ChampsFormulaire {
  const $ = cheerio.load(html);
  const formulaire = $("#form-search-advanced-search");

  const champGeo = formulaire.find('.enhanced-select[data-name$="controlledAccessGeographicName"]').first();
  const nomChampCommune = champGeo.attr("data-name");
  if (!nomChampCommune) {
    throw new Error("Champ de recherche par commune introuvable dans le formulaire.");
  }
  const optionsCommune: string[] = JSON.parse(champGeo.attr("data-options") ?? "[]");

  const champType = formulaire.find('.enhanced-select[data-name$="controlledAccessPhysicalCharacteristic"]').first();
  const nomChampTypeActe = champType.attr("data-name");
  const optionsTypeActe: string[] = nomChampTypeActe
    ? JSON.parse(champType.attr("data-options") ?? "[]")
    : [];

  const dateExacte = formulaire.find('input[type="number"][id$="-date"]').attr("name");
  const dateDebut = formulaire.find('input[id$="-date_begin"]').attr("name");
  const dateFin = formulaire.find('input[id$="-date_end"]').attr("name");

  return {
    commune: nomChampCommune,
    typeActe: nomChampTypeActe,
    dateExacte,
    dateDebut,
    dateFin,
    optionsCommune,
    optionsTypeActe,
  };
}

export function trouverMeilleureCorrespondanceCommune(saisie: string, options: string[]): string | undefined {
  const saisieNormalisee = normaliser(saisie);

  const correspondanceNomBase = options.find((option) => normaliser(nomBase(option)) === saisieNormalisee);
  if (correspondanceNomBase) {
    return correspondanceNomBase;
  }

  return options.find((option) => normaliser(option) === saisieNormalisee);
}

export function trouverOptionsTypeActe(typeActe: TypeActe, options: string[]): string[] {
  const motsCles = MOTS_CLES_TYPE_ACTE[typeActe];
  const motsExclus = MOTS_EXCLUS_TYPE_ACTE[typeActe];

  return options.filter((option) => {
    const optionNormalisee = normaliser(option);
    const contientMotCle = motsCles.some((mot) => optionNormalisee.includes(mot));
    const contientMotExclu = motsExclus.some((mot) => optionNormalisee.includes(mot));
    return contientMotCle && !contientMotExclu;
  });
}

export function analyserResultats(html: string, departement: string, communeDemandee: string): RegistreTrouve[] {
  const $ = cheerio.load(html);
  const resultats: RegistreTrouve[] = [];

  $("tr.result.record").each((_, element) => {
    const ligne = $(element);

    const lienNotice = ligne.find('a[title^="Voir la notice complète"]').first();
    const url = lienNotice.attr("href")?.trim();
    const titre = lienNotice.find("h2 span").first().text().trim();
    if (!url || !titre) {
      return;
    }

    const colonneParLibelle = (libelle: string): string | undefined => {
      let valeur: string | undefined;
      ligne.find("td").each((_i, td) => {
        const cellule = $(td);
        if (cellule.find("span.label").first().text().trim() === libelle) {
          valeur = cellule.find(".ellipsis").first().text().trim();
        }
      });
      return valeur || undefined;
    };

    const cote = colonneParLibelle("Cote");
    const dateTexte = colonneParLibelle("Date") ?? "";
    const lieu = colonneParLibelle("Lieu");
    const typeActeTexte = colonneParLibelle("Type de document") ?? "";
    const typesActes = typeActeTexte
      .split(",")
      .map((valeur) => valeur.trim())
      .filter((valeur) => valeur.length > 0);

    const correspondanceAnnees = dateTexte.match(/(\d{3,4})(?:\D+(\d{3,4}))?/);
    const anneeDebut = correspondanceAnnees ? Number(correspondanceAnnees[1]) : Number.NaN;
    const anneeFin = correspondanceAnnees
      ? Number(correspondanceAnnees[2] ?? correspondanceAnnees[1])
      : Number.NaN;

    resultats.push({
      departement,
      commune: communeDemandee,
      titre,
      typesActes,
      anneeDebut,
      anneeFin,
      cote,
      lieu,
      url,
    });
  });

  return resultats;
}

const UTILISATEUR_AGENT =
  "Mozilla/5.0 (compatible; claude-mcp-genealogy/0.1; +https://github.com/FColinet/claude-mcp-genealogy)";

async function recupererPageParDefaut(url: string): Promise<string> {
  const reponse = await fetch(url, { headers: { "User-Agent": UTILISATEUR_AGENT } });
  if (!reponse.ok) {
    throw new Error(`La requête vers ${url} a échoué (HTTP ${reponse.status}).`);
  }
  return reponse.text();
}

export function creerConnecteurPortailRechercheAvancee(
  config: ConfigPortailRechercheAvancee,
  recupererPage: RecupererPage = recupererPageParDefaut,
): DepartementConnector {
  return {
    code: config.code,
    nom: config.nom,
    async rechercherRegistres(query: RechercheRegistreQuery): Promise<RegistreTrouve[]> {
      const htmlFormulaire = await recupererPage(`${config.baseUrl}/search/form/${config.formUuid}`);
      const champs = analyserFormulaire(htmlFormulaire);

      const commune = trouverMeilleureCorrespondanceCommune(query.commune, champs.optionsCommune);
      if (!commune) {
        return [];
      }

      const parametres = new URLSearchParams();
      parametres.set("formUuid", config.formUuid);
      parametres.set("sort", "date_asc");
      parametres.set("mode", "table");
      parametres.set(champs.commune, commune);

      if (query.typeActe && champs.typeActe) {
        const optionsTypeActe = trouverOptionsTypeActe(query.typeActe, champs.optionsTypeActe);
        for (const option of optionsTypeActe) {
          parametres.append(champs.typeActe, option);
        }
      }

      if (query.anneeDebut && query.anneeFin && champs.dateDebut && champs.dateFin) {
        parametres.set(champs.dateDebut, String(query.anneeDebut));
        parametres.set(champs.dateFin, String(query.anneeFin));
      } else if (query.anneeDebut && champs.dateExacte) {
        parametres.set(champs.dateExacte, String(query.anneeDebut));
      }

      const htmlResultats = await recupererPage(`${config.baseUrl}/search/results?${parametres.toString()}`);
      return analyserResultats(htmlResultats, config.code, query.commune);
    },
  };
}
