import { chromium, type Browser, type Page } from "playwright";
import type { RechercheRegistreQuery, RegistreTrouve, TypeActe } from "../types.js";

/**
 * Pilote un navigateur (Playwright) sur agatha.arch.be, le portail de recherche
 * des Archives de l'État en Belgique. Contrairement aux portails français
 * (Nord, Marne), Agatha est une application JavaScript complète : il n'y a pas
 * de formulaire HTML classique à soumettre directement, il faut piloter la
 * page comme le ferait un utilisateur (remplir les champs, cliquer).
 *
 * Un compte agatha.arch.be est nécessaire pour rechercher. Contrairement aux
 * anti-bots rencontrés pour l'Aisne et le Pas-de-Calais, il n'y a ici ni
 * CAPTCHA ni protection anti-automatisation sur la connexion ou la recherche
 * elle-même (seuls la création de compte et le mot de passe oublié utilisent
 * un reCAPTCHA) : ce n'est donc pas un contournement, juste une automatisation
 * d'un usage normal du site avec les identifiants de l'utilisateur.
 */

export interface PiloteAgatha {
  connecter(nomUtilisateur: string, motDePasse: string): Promise<void>;
  rechercherRegistresParoissiaux(query: RechercheRegistreQuery): Promise<RegistreTrouve[]>;
  rechercherRegistresEtatCivil(query: RechercheRegistreQuery): Promise<RegistreTrouve[]>;
  fermer(): Promise<void>;
}

export class IdentifiantsAgathaInvalidesError extends Error {
  constructor(messageSite: string) {
    super(`Connexion à agatha.arch.be refusée : ${messageSite}`);
    this.name = "IdentifiantsAgathaInvalidesError";
  }
}

export class ResultatsAgathaNonReconnusError extends Error {
  constructor(extraitHtml: string) {
    super(
      "La page de résultats d'agatha.arch.be n'a pas la structure attendue (ni tableau de résultats, ni message " +
        `« aucun résultat » détecté). Extrait de la page pour diagnostic : ${extraitHtml.slice(0, 500)}`,
    );
    this.name = "ResultatsAgathaNonReconnusError";
  }
}

const URL_BASE = "https://agatha.arch.be";

/** Correspondance entre la case à cocher « type d'acte » du formulaire et notre catégorie interne. */
const SUFFIXE_TYPEACTE: Record<TypeActe, 1 | 2 | 3 | undefined> = {
  naissance: 1,
  mariage: 2,
  deces: 3,
  table_decennale: undefined,
};

async function connecter(page: Page, nomUtilisateur: string, motDePasse: string): Promise<void> {
  await page.goto(`${URL_BASE}/fr/`, { waitUntil: "domcontentloaded" });

  await page.evaluate(() => {
    const jquery = (globalThis as unknown as { $?: (sel: string) => { modal: (action: string) => void } }).$;
    jquery?.("#modal_login")?.modal("show");
  });
  await page.waitForSelector("#form_login", { state: "visible", timeout: 10000 });

  await page.fill("#username", nomUtilisateur);
  await page.fill("#password", motDePasse);

  const [erreur] = await Promise.all([
    page
      .waitForFunction(() => (document.querySelector("#errorLogin")?.textContent ?? "").trim() !== "", {
        timeout: 10000,
      })
      .then(() => page.$eval("#errorLogin", (el) => el.textContent?.trim() ?? ""))
      .catch(() => null),
    page.click("#confirmButton_login"),
  ]);

  if (erreur) {
    throw new IdentifiantsAgathaInvalidesError(erreur);
  }

  await page.waitForLoadState("domcontentloaded");
}

async function selectionnerCommune(page: Page, suffixe: "PR" | "CS", commune: string): Promise<boolean> {
  const champ = `#PLACE_${suffixe}`;
  await page.click(champ);
  await page.type(champ, commune, { delay: 60 });

  const suggestion = page.locator(`a.btn-link`, { hasText: commune }).first();
  try {
    await suggestion.waitFor({ state: "visible", timeout: 6000 });
    await suggestion.click();
    return true;
  } catch {
    return false;
  }
}

async function cocherTypeActe(page: Page, suffixe: "PR" | "CS", typeActe: TypeActe | undefined): Promise<void> {
  if (!typeActe) {
    return;
  }
  const indice = SUFFIXE_TYPEACTE[typeActe];
  if (!indice) {
    return;
  }
  await page.check(`#TYPEACTES_${indice}_${suffixe}`).catch(() => undefined);
}

async function remplirPeriode(
  page: Page,
  suffixe: "PR" | "CS",
  anneeDebut: number | undefined,
  anneeFin: number | undefined,
): Promise<void> {
  if (anneeDebut === undefined && anneeFin === undefined) {
    return;
  }
  if (anneeDebut !== undefined && anneeFin !== undefined && anneeDebut === anneeFin) {
    await page.fill(`#exactYear_${suffixe}`, String(anneeDebut)).catch(() => undefined);
    return;
  }
  // Filtrage par période (bornes différentes) non implémenté avec certitude : la structure exacte
  // des champs de plage de dates n'a pas pu être vérifiée avec un compte réel (voir README). On
  // ignore le filtre plutôt que de risquer d'envoyer une valeur incorrecte au formulaire.
}

async function extraireResultats(
  page: Page,
  departement: string,
  commune: string,
  suffixe: "PR" | "CS",
): Promise<RegistreTrouve[]> {
  const zoneResultats = page.locator(`#GENEALOGICALSOURCES_RESULTS_${suffixe}, .tab-pane.active, body`).first();

  const aucunResultat = zoneResultats.getByText(/aucun r[ée]sultat|no results?/i).first();
  const tableau = zoneResultats.locator("table").first();

  const resultatCourse = await Promise.race([
    aucunResultat
      .waitFor({ state: "visible", timeout: 15000 })
      .then(() => "vide" as const)
      .catch(() => null),
    tableau
      .waitFor({ state: "visible", timeout: 15000 })
      .then(() => "tableau" as const)
      .catch(() => null),
  ]);

  if (resultatCourse === "vide") {
    return [];
  }

  if (resultatCourse === "tableau") {
    const lignes = await tableau.evaluate((table) => {
      const entetes = Array.from(table.querySelectorAll("thead th")).map((th) => th.textContent?.trim() ?? "");
      const corps = Array.from(table.querySelectorAll("tbody tr")).map((tr) =>
        Array.from(tr.querySelectorAll("td")).map((td) => td.textContent?.trim() ?? ""),
      );
      return { entetes, corps };
    });

    return lignes.corps
      .filter((cellules) => cellules.some((valeur) => valeur.length > 0))
      .map((cellules) => {
        const parLibelle = (libelle: string): string | undefined => {
          const index = lignes.entetes.findIndex((entete) => entete.toLowerCase().includes(libelle));
          return index >= 0 ? cellules[index] : undefined;
        };
        const dateTexte = parLibelle("date") ?? "";
        const correspondanceAnnees = dateTexte.match(/(\d{3,4})(?:\D+(\d{3,4}))?/);
        const anneeDebut = correspondanceAnnees ? Number(correspondanceAnnees[1]) : Number.NaN;
        const anneeFin = correspondanceAnnees ? Number(correspondanceAnnees[2] ?? correspondanceAnnees[1]) : Number.NaN;

        const typeActeTexte = parLibelle("type");

        return {
          departement,
          commune,
          titre: cellules[0] ?? "",
          typesActes: typeActeTexte ? [typeActeTexte] : [],
          anneeDebut,
          anneeFin,
          cote: parLibelle("cote"),
          lieu: parLibelle("lieu") ?? parLibelle("commune"),
          url: page.url(),
        } satisfies RegistreTrouve;
      });
  }

  const extrait = await zoneResultats.evaluate((el) => el.outerHTML).catch(() => "(page inaccessible)");
  throw new ResultatsAgathaNonReconnusError(extrait);
}

async function rechercher(
  page: Page,
  suffixe: "PR" | "CS",
  boutonRecherche: string,
  departement: string,
  query: RechercheRegistreQuery,
): Promise<RegistreTrouve[]> {
  await page.goto(`${URL_BASE}/fr/search/genealogie/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(`#PLACE_${suffixe}`, { timeout: 10000 });

  const communeTrouvee = await selectionnerCommune(page, suffixe, query.commune);
  if (!communeTrouvee) {
    return [];
  }

  await cocherTypeActe(page, suffixe, query.typeActe);
  await remplirPeriode(page, suffixe, query.anneeDebut, query.anneeFin);

  await page.click(boutonRecherche);

  return extraireResultats(page, departement, query.commune, suffixe);
}

export function creerPiloteAgathaPlaywright(): PiloteAgatha {
  let browser: Browser | undefined;
  let page: Page | undefined;

  return {
    async connecter(nomUtilisateur: string, motDePasse: string): Promise<void> {
      browser = await chromium.launch();
      const contexte = await browser.newContext();
      page = await contexte.newPage();
      await connecter(page, nomUtilisateur, motDePasse);
    },

    async rechercherRegistresParoissiaux(query: RechercheRegistreQuery): Promise<RegistreTrouve[]> {
      if (!page) throw new Error("Le pilote Agatha n'est pas connecté.");
      return rechercher(page, "PR", "#GENEALOGICALSOURCES_SUBMIT_PR_A", "BE", query);
    },

    async rechercherRegistresEtatCivil(query: RechercheRegistreQuery): Promise<RegistreTrouve[]> {
      if (!page) throw new Error("Le pilote Agatha n'est pas connecté.");
      return rechercher(page, "CS", "#GENEALOGICALSOURCES_SUBMIT_CS_A", "BE", query);
    },

    async fermer(): Promise<void> {
      await browser?.close();
    },
  };
}
