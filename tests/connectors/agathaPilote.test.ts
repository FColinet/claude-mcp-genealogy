import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { lancerChromium } = vi.hoisted(() => ({ lancerChromium: vi.fn() }));

vi.mock("playwright", () => ({ chromium: { launch: lancerChromium } }));

import {
  creerPiloteAgathaPlaywright,
  IdentifiantsAgathaInvalidesError,
  ResultatsAgathaNonReconnusError,
} from "../../src/connectors/agathaPilote.js";
import type { RechercheRegistreQuery } from "../../src/types.js";

/**
 * Ces tests remplacent Playwright par une page factice : ils vérifient le scénario
 * de pilotage (quels champs sont remplis, quels boutons cliqués, comment la page de
 * résultats est interprétée), pas le comportement réel du site agatha.arch.be.
 */

type EtatResultats = "vide" | "tableau" | "inconnu";

interface Scenario {
  /** Message affiché par le site après une connexion refusée ; absent = connexion acceptée. */
  erreurConnexion?: string;
  /** La commune est-elle proposée par l'autocomplétion ? (défaut : oui) */
  communeProposee?: boolean;
  /** Ce que la page affiche après la recherche (défaut : « aucun résultat »). */
  resultats?: EtatResultats;
  entetes?: Array<string | null>;
  lignes?: Array<Array<string | null>>;
  /** Contenu renvoyé (ou erreur levée) quand on lit la page non reconnue pour le diagnostic. */
  extraitPage?: string | Error;
  caseTypeActeAbsente?: boolean;
  champAnneeAbsent?: boolean;
}

const URL_PAGE_RECHERCHE = "https://agatha.arch.be/fr/search/genealogie/";
const REQUETE: RechercheRegistreQuery = { commune: "Rance" };

/** Rejette après un court délai : simule un `waitFor` qui expire sans que la condition soit remplie. */
function expireApresDelai(): Promise<never> {
  return new Promise((_resolve, rejeter) => setTimeout(() => rejeter(new Error("délai dépassé")), 5));
}

/** Ajoute `first()` à un locator factice : renvoie le locator lui-même, comme un locator Playwright à un seul élément. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function avecFirst<T extends Record<string, any>>(methodes: T): T & { first: () => T } {
  const locator = { ...methodes, first: () => locator } as T & { first: () => T };
  return locator;
}

function creerTableFactice(entetes: Array<string | null>, lignes: Array<Array<string | null>>) {
  const cellules = (valeurs: Array<string | null>) => valeurs.map((textContent) => ({ textContent }));
  return {
    querySelectorAll: (selecteur: string) =>
      selecteur === "thead th"
        ? cellules(entetes)
        : lignes.map((valeurs) => ({ querySelectorAll: () => cellules(valeurs) })),
  };
}

function creerPageFactice(scenario: Scenario = {}) {
  const config = { communeProposee: true, resultats: "vide" as EtatResultats, ...scenario };

  const suggestion = avecFirst({
    waitFor: vi.fn(async () => {
      if (!config.communeProposee) throw new Error("suggestion introuvable");
    }),
    click: vi.fn(async () => undefined),
  });

  const aucunResultat = avecFirst({
    waitFor: vi.fn(() => (config.resultats === "vide" ? Promise.resolve() : expireApresDelai())),
  });

  const tableau = avecFirst({
    waitFor: vi.fn(() => (config.resultats === "tableau" ? Promise.resolve() : expireApresDelai())),
    evaluate: vi.fn(async (lire: (table: unknown) => unknown) =>
      lire(creerTableFactice(config.entetes ?? [], config.lignes ?? [])),
    ),
  });

  const zone = avecFirst({
    getByText: vi.fn(() => aucunResultat),
    locator: vi.fn(() => tableau),
    evaluate: vi.fn(async (lire: (element: unknown) => unknown) => {
      if (config.extraitPage instanceof Error) throw config.extraitPage;
      return lire({ outerHTML: config.extraitPage ?? "<div>page inattendue</div>" });
    }),
  });

  return {
    goto: vi.fn(async () => undefined),
    evaluate: vi.fn(async (executer: () => void) => {
      executer();
    }),
    waitForSelector: vi.fn(async () => undefined),
    fill: vi.fn(async (selecteur: string) => {
      if (config.champAnneeAbsent && selecteur.startsWith("#exactYear")) {
        throw new Error("champ introuvable");
      }
    }),
    click: vi.fn(async () => undefined),
    type: vi.fn(async () => undefined),
    check: vi.fn(async () => {
      if (config.caseTypeActeAbsente) throw new Error("case introuvable");
    }),
    waitForFunction: vi.fn(async (condition: () => boolean) => {
      if (config.erreurConnexion === undefined) throw new Error("délai dépassé");
      vi.stubGlobal("document", { querySelector: () => ({ textContent: config.erreurConnexion }) });
      return condition();
    }),
    $eval: vi.fn(async (_selecteur: string, lire: (element: unknown) => string) =>
      lire({ textContent: config.erreurConnexion }),
    ),
    waitForLoadState: vi.fn(async () => undefined),
    url: vi.fn(() => URL_PAGE_RECHERCHE),
    locator: vi.fn((selecteur: string) => (selecteur.startsWith("a.btn-link") ? suggestion : zone)),
  };
}

function brancherNavigateur(scenario?: Scenario) {
  const page = creerPageFactice(scenario);
  const fermer = vi.fn(async () => undefined);
  lancerChromium.mockResolvedValue({
    newContext: async () => ({ newPage: async () => page }),
    close: fermer,
  });
  return { page, fermer };
}

async function piloteConnecte(scenario?: Scenario) {
  const navigateur = brancherNavigateur(scenario);
  const pilote = creerPiloteAgathaPlaywright();
  await pilote.connecter("utilisateur", "motdepasse");
  return { pilote, ...navigateur };
}

describe("creerPiloteAgathaPlaywright", () => {
  beforeEach(() => {
    lancerChromium.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("avant la connexion", () => {
    it("refuse de rechercher des registres paroissiaux tant qu'il n'est pas connecté", async () => {
      const pilote = creerPiloteAgathaPlaywright();
      await expect(pilote.rechercherRegistresParoissiaux(REQUETE)).rejects.toThrow("n'est pas connecté");
    });

    it("refuse de rechercher des registres d'état civil tant qu'il n'est pas connecté", async () => {
      const pilote = creerPiloteAgathaPlaywright();
      await expect(pilote.rechercherRegistresEtatCivil(REQUETE)).rejects.toThrow("n'est pas connecté");
    });

    it("peut être fermé sans erreur même s'il n'a jamais été connecté", async () => {
      const pilote = creerPiloteAgathaPlaywright();
      await expect(pilote.fermer()).resolves.toBeUndefined();
    });
  });

  describe("connecter", () => {
    it("lance Chromium, ouvre la page d'accueil et saisit les identifiants", async () => {
      const { page } = await piloteConnecte();

      expect(lancerChromium).toHaveBeenCalledTimes(1);
      expect(page.goto).toHaveBeenCalledWith("https://agatha.arch.be/fr/", { waitUntil: "domcontentloaded" });
      expect(page.fill).toHaveBeenCalledWith("#username", "utilisateur");
      expect(page.fill).toHaveBeenCalledWith("#password", "motdepasse");
      expect(page.click).toHaveBeenCalledWith("#confirmButton_login");
      expect(page.waitForLoadState).toHaveBeenCalled();
    });

    it("affiche la fenêtre de connexion avec jQuery quand il est présent sur la page", async () => {
      const modal = vi.fn();
      vi.stubGlobal(
        "$",
        vi.fn(() => ({ modal })),
      );

      await piloteConnecte();

      expect(modal).toHaveBeenCalledWith("show");
    });

    it("signale des identifiants refusés avec le message affiché par le site", async () => {
      brancherNavigateur({ erreurConnexion: "Identifiant ou mot de passe incorrect" });
      const pilote = creerPiloteAgathaPlaywright();

      const echec = pilote.connecter("utilisateur", "mauvais");

      await expect(echec).rejects.toBeInstanceOf(IdentifiantsAgathaInvalidesError);
      await expect(echec).rejects.toThrow("refusée : Identifiant ou mot de passe incorrect");
    });
  });

  describe("recherche", () => {
    it("renvoie une liste vide quand la commune n'est pas proposée par l'autocomplétion", async () => {
      const { pilote, page } = await piloteConnecte({ communeProposee: false });

      const resultats = await pilote.rechercherRegistresParoissiaux(REQUETE);

      expect(resultats).toEqual([]);
      expect(page.click).not.toHaveBeenCalledWith("#GENEALOGICALSOURCES_SUBMIT_PR_A");
    });

    it("renvoie une liste vide quand le site affiche « aucun résultat »", async () => {
      const { pilote } = await piloteConnecte({ resultats: "vide" });

      expect(await pilote.rechercherRegistresEtatCivil(REQUETE)).toEqual([]);
    });

    it("interroge l'onglet des registres paroissiaux", async () => {
      const { pilote, page } = await piloteConnecte();

      await pilote.rechercherRegistresParoissiaux(REQUETE);

      expect(page.goto).toHaveBeenCalledWith(URL_PAGE_RECHERCHE, { waitUntil: "domcontentloaded" });
      expect(page.type).toHaveBeenCalledWith("#PLACE_PR", "Rance", { delay: 60 });
      expect(page.click).toHaveBeenCalledWith("#GENEALOGICALSOURCES_SUBMIT_PR_A");
    });

    it("interroge l'onglet de l'état civil", async () => {
      const { pilote, page } = await piloteConnecte();

      await pilote.rechercherRegistresEtatCivil(REQUETE);

      expect(page.type).toHaveBeenCalledWith("#PLACE_CS", "Rance", { delay: 60 });
      expect(page.click).toHaveBeenCalledWith("#GENEALOGICALSOURCES_SUBMIT_CS_A");
    });

    it("extrait les registres du tableau de résultats", async () => {
      const { pilote } = await piloteConnecte({
        resultats: "tableau",
        entetes: ["Description", "Type", "Date", "Cote", "Lieu"],
        lignes: [["Baptêmes, mariages, sépultures", "Registres paroissiaux", "1650 - 1700", "BE-AE-123", "Rance"]],
      });

      const resultats = await pilote.rechercherRegistresParoissiaux(REQUETE);

      expect(resultats).toEqual([
        {
          departement: "BE",
          commune: "Rance",
          titre: "Baptêmes, mariages, sépultures",
          typesActes: ["Registres paroissiaux"],
          anneeDebut: 1650,
          anneeFin: 1700,
          cote: "BE-AE-123",
          lieu: "Rance",
          url: URL_PAGE_RECHERCHE,
        },
      ]);
    });

    it("lit une année unique comme début et fin de période", async () => {
      const { pilote } = await piloteConnecte({
        resultats: "tableau",
        entetes: ["Description", "Date"],
        lignes: [["Registre de 1850", "1850"]],
      });

      const resultats = await pilote.rechercherRegistresEtatCivil(REQUETE);

      expect(resultats[0]).toMatchObject({ anneeDebut: 1850, anneeFin: 1850 });
    });

    it("renvoie NaN quand la date est illisible et se rabat sur la colonne « Commune » pour le lieu", async () => {
      const { pilote } = await piloteConnecte({
        resultats: "tableau",
        entetes: ["Description", "Commune"],
        lignes: [["Registre sans date", "Rance"]],
      });

      const [registre] = await pilote.rechercherRegistresEtatCivil(REQUETE);

      expect(registre?.titre).toBe("Registre sans date");
      expect(Number.isNaN(registre?.anneeDebut)).toBe(true);
      expect(Number.isNaN(registre?.anneeFin)).toBe(true);
      expect(registre?.typesActes).toEqual([]);
      expect(registre?.cote).toBeUndefined();
      expect(registre?.lieu).toBe("Rance");
    });

    it("ignore les lignes vides du tableau", async () => {
      const { pilote } = await piloteConnecte({
        resultats: "tableau",
        entetes: [null, "Date"],
        lignes: [
          [null, null],
          ["", ""],
          ["Registre réel", "1700"],
        ],
      });

      const resultats = await pilote.rechercherRegistresParoissiaux(REQUETE);

      expect(resultats).toHaveLength(1);
      expect(resultats[0]?.titre).toBe("Registre réel");
    });

    it("lève une erreur explicite, avec un extrait de la page, quand les résultats ne sont pas reconnus", async () => {
      const { pilote } = await piloteConnecte({
        resultats: "inconnu",
        extraitPage: "<div>Maintenance en cours</div>",
      });

      const echec = pilote.rechercherRegistresEtatCivil(REQUETE);

      await expect(echec).rejects.toBeInstanceOf(ResultatsAgathaNonReconnusError);
      await expect(echec).rejects.toThrow("<div>Maintenance en cours</div>");
    });

    it("signale que la page est inaccessible quand son contenu ne peut pas être lu pour le diagnostic", async () => {
      const { pilote } = await piloteConnecte({
        resultats: "inconnu",
        extraitPage: new Error("page fermée"),
      });

      await expect(pilote.rechercherRegistresEtatCivil(REQUETE)).rejects.toThrow("(page inaccessible)");
    });
  });

  describe("filtres du formulaire", () => {
    it.each([
      ["naissance", 1],
      ["mariage", 2],
      ["deces", 3],
    ] as const)("coche la case du type d'acte « %s »", async (typeActe, indice) => {
      const { pilote, page } = await piloteConnecte();

      await pilote.rechercherRegistresEtatCivil({ commune: "Rance", typeActe });

      expect(page.check).toHaveBeenCalledWith(`#TYPEACTES_${indice}_CS`);
    });

    it("ne coche aucune case pour une table décennale ou sans type d'acte", async () => {
      const { pilote, page } = await piloteConnecte();

      await pilote.rechercherRegistresEtatCivil({ commune: "Rance", typeActe: "table_decennale" });
      await pilote.rechercherRegistresEtatCivil({ commune: "Rance" });

      expect(page.check).not.toHaveBeenCalled();
    });

    it("poursuit la recherche même si la case du type d'acte est introuvable", async () => {
      const { pilote } = await piloteConnecte({ caseTypeActeAbsente: true });

      await expect(pilote.rechercherRegistresEtatCivil({ commune: "Rance", typeActe: "naissance" })).resolves.toEqual([]);
    });

    it("renseigne l'année exacte quand le début et la fin de période sont identiques", async () => {
      const { pilote, page } = await piloteConnecte();

      await pilote.rechercherRegistresEtatCivil({ commune: "Rance", anneeDebut: 1850, anneeFin: 1850 });

      expect(page.fill).toHaveBeenCalledWith("#exactYear_CS", "1850");
    });

    it("ignore le filtre de période quand les bornes diffèrent ou qu'une seule est fournie", async () => {
      const { pilote, page } = await piloteConnecte();

      await pilote.rechercherRegistresEtatCivil({ commune: "Rance", anneeDebut: 1800, anneeFin: 1810 });
      await pilote.rechercherRegistresEtatCivil({ commune: "Rance", anneeDebut: 1800 });

      expect(page.fill).not.toHaveBeenCalledWith("#exactYear_CS", expect.anything());
    });

    it("poursuit la recherche même si le champ de l'année exacte est introuvable", async () => {
      const { pilote } = await piloteConnecte({ champAnneeAbsent: true });

      await expect(
        pilote.rechercherRegistresEtatCivil({ commune: "Rance", anneeDebut: 1850, anneeFin: 1850 }),
      ).resolves.toEqual([]);
    });
  });

  describe("fermer", () => {
    it("ferme le navigateur ouvert par la connexion", async () => {
      const { pilote, fermer } = await piloteConnecte();

      await pilote.fermer();

      expect(fermer).toHaveBeenCalledTimes(1);
    });
  });
});
