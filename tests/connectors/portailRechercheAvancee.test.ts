import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  analyserFormulaire,
  analyserResultats,
  creerConnecteurPortailRechercheAvancee,
  trouverMeilleureCorrespondanceCommune,
  trouverOptionsTypeActe,
} from "../../src/connectors/portailRechercheAvancee.js";

const dossierFixtures = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");

function lireFixture(chemin: string): string {
  return readFileSync(join(dossierFixtures, chemin), "utf-8");
}

const formulaireNord = lireFixture("nord/formulaire-recherche.html");
const resultatsNord = lireFixture("nord/resultats-lille.html");
const formulaireMarne = lireFixture("marne/formulaire-recherche.html");
const resultatsMarne = lireFixture("marne/resultats-chalons.html");
const resultatsMarneSansCorrespondance = lireFixture("marne/resultats-sans-correspondance.html");

describe("analyserFormulaire", () => {
  it("identifie les champs du formulaire du Nord", () => {
    const champs = analyserFormulaire(formulaireNord);

    expect(champs.commune).toBe("0-controlledAccessGeographicName");
    expect(champs.typeActe).toBe("1-controlledAccessPhysicalCharacteristic");
    expect(champs.dateExacte).toBe("2-date");
    expect(champs.dateDebut).toBe("3-date_begin");
    expect(champs.dateFin).toBe("3-date_end");
    expect(champs.optionsCommune).toContain("LILLE");
    expect(champs.optionsTypeActe).toEqual(["Baptêmes", "Naissances", "Mariages", "Sépultures", "Décès"]);
  });

  it("identifie les champs du formulaire de la Marne (avec un 2e champ géographique)", () => {
    const champs = analyserFormulaire(formulaireMarne);

    expect(champs.commune).toBe("0-controlledAccessGeographicName");
    expect(champs.typeActe).toBe("4-controlledAccessPhysicalCharacteristic");
    expect(champs.dateExacte).toBe("3-date");
    expect(champs.dateDebut).toBe("2-date_begin");
    expect(champs.dateFin).toBe("2-date_end");
    expect(champs.optionsCommune).toContain("Châlons-en-Champagne (Marne, France)");
    expect(champs.optionsTypeActe).toEqual([
      "baptêmes - naissances",
      "mariages",
      "publications de mariage",
      "sépultures - décès",
      "tables décennales",
    ]);
  });

  it("lève une erreur explicite quand le formulaire ne contient pas de champ de commune", () => {
    const html = '<form id="form-search-advanced-search"></form>';

    expect(() => analyserFormulaire(html)).toThrow("Champ de recherche par commune introuvable");
  });

  it("tolère un formulaire réduit au seul champ de commune, sans options ni filtres", () => {
    const html =
      '<form id="form-search-advanced-search">' +
      '<div class="enhanced-select" data-name="0-controlledAccessGeographicName"></div>' +
      "</form>";

    const champs = analyserFormulaire(html);

    expect(champs.commune).toBe("0-controlledAccessGeographicName");
    expect(champs.optionsCommune).toEqual([]);
    expect(champs.typeActe).toBeUndefined();
    expect(champs.optionsTypeActe).toEqual([]);
    expect(champs.dateExacte).toBeUndefined();
    expect(champs.dateDebut).toBeUndefined();
    expect(champs.dateFin).toBeUndefined();
  });
});

describe("trouverMeilleureCorrespondanceCommune", () => {
  it("trouve une correspondance insensible à la casse pour une commune simple", () => {
    const champs = analyserFormulaire(formulaireNord);
    expect(trouverMeilleureCorrespondanceCommune("lille", champs.optionsCommune)).toBe("LILLE");
  });

  it("trouve une correspondance exacte du nom de commune malgré le suffixe entre parenthèses", () => {
    const champs = analyserFormulaire(formulaireMarne);
    expect(trouverMeilleureCorrespondanceCommune("Châlons-en-Champagne", champs.optionsCommune)).toBe(
      "Châlons-en-Champagne (Marne, France)",
    );
  });

  it("distingue une ancienne commune de la commune actuelle", () => {
    const champs = analyserFormulaire(formulaireMarne);
    expect(trouverMeilleureCorrespondanceCommune("Châlons-sur-Marne", champs.optionsCommune)).toBe(
      "Châlons-sur-Marne (Marne ; ancienne commune)",
    );
  });

  it("renvoie undefined si aucune commune ne correspond", () => {
    const champs = analyserFormulaire(formulaireNord);
    expect(trouverMeilleureCorrespondanceCommune("Commune Imaginaire Xyz", champs.optionsCommune)).toBeUndefined();
  });
});

describe("trouverOptionsTypeActe", () => {
  it("associe 'naissance' aux baptêmes et naissances (Nord)", () => {
    const champs = analyserFormulaire(formulaireNord);
    expect(trouverOptionsTypeActe("naissance", champs.optionsTypeActe)).toEqual(["Baptêmes", "Naissances"]);
  });

  it("associe 'mariage' aux mariages sans inclure les publications de mariage (Marne)", () => {
    const champs = analyserFormulaire(formulaireMarne);
    expect(trouverOptionsTypeActe("mariage", champs.optionsTypeActe)).toEqual(["mariages"]);
  });

  it("associe 'deces' aux sépultures/décès (Marne)", () => {
    const champs = analyserFormulaire(formulaireMarne);
    expect(trouverOptionsTypeActe("deces", champs.optionsTypeActe)).toEqual(["sépultures - décès"]);
  });

  it("renvoie une liste vide quand le département ne propose pas ce type d'acte", () => {
    const champs = analyserFormulaire(formulaireNord);
    expect(trouverOptionsTypeActe("table_decennale", champs.optionsTypeActe)).toEqual([]);
  });
});

describe("analyserResultats", () => {
  it("extrait les registres depuis une page de résultats du Nord (mode table)", () => {
    const resultats = analyserResultats(resultatsNord, "59", "Lille");

    expect(resultats.length).toBeGreaterThan(0);
    expect(resultats[0]).toEqual({
      departement: "59",
      commune: "Lille",
      titre: "LILLE / N (désordre) [1793-1796]",
      typesActes: ["Naissances"],
      anneeDebut: 1793,
      anneeFin: 1796,
      cote: "5 Mi 044 R 112",
      lieu: "LILLE",
      url: "https://archivesdepartementales.lenord.fr/ark:/33518/vkj09w1rhq8z",
    });
  });

  it("extrait les registres depuis une page de résultats de la Marne, avec plusieurs types d'actes", () => {
    const resultats = analyserResultats(resultatsMarne, "51", "Châlons-en-Champagne");

    expect(resultats[0]).toEqual({
      departement: "51",
      commune: "Châlons-en-Champagne",
      titre: "Châlons-sur-Marne. Saint-Germain. Baptêmes, mariages, sépultures 1566-1627",
      typesActes: ["baptêmes - naissances", "sépultures - décès", "mariages"],
      anneeDebut: 1566,
      anneeFin: 1627,
      cote: "GG 34",
      lieu: "Châlons-en-Champagne (Marne, France), Châlons-sur-Marne (Marne ; ancienne commune), Châlons-sur-Marne (Marne) -- Paroisse Saint-Germain",
      url: "https://archives.marne.fr/ark:/86869/3w9pz48clr2v",
    });
  });

  it("renvoie une liste vide quand la page ne contient aucun résultat", () => {
    expect(analyserResultats(resultatsMarneSansCorrespondance, "51", "Commune inconnue")).toEqual([]);
  });

  it("ignore une ligne de résultat dépourvue de lien vers la notice", () => {
    const html = '<table><tr class="result record"><td>Ligne sans lien</td></tr></table>';

    expect(analyserResultats(html, "59", "Lille")).toEqual([]);
  });

  it("renvoie des années NaN et aucun type d'acte quand la ligne n'a ni date ni type de document", () => {
    const html =
      '<table><tr class="result record"><td>' +
      '<a title="Voir la notice complète du document" href="https://exemple.fr/ark:/1"><h2><span>Registre sans date</span></h2></a>' +
      "</td></tr></table>";

    const [registre] = analyserResultats(html, "59", "Lille");

    expect(registre?.titre).toBe("Registre sans date");
    expect(registre?.url).toBe("https://exemple.fr/ark:/1");
    expect(Number.isNaN(registre?.anneeDebut)).toBe(true);
    expect(Number.isNaN(registre?.anneeFin)).toBe(true);
    expect(registre?.typesActes).toEqual([]);
    expect(registre?.cote).toBeUndefined();
    expect(registre?.lieu).toBeUndefined();
  });

  it("lit une année unique comme début et fin de période", () => {
    const html =
      '<table><tr class="result record">' +
      '<td><a title="Voir la notice complète du document" href="https://exemple.fr/ark:/2"><h2><span>Registre de 1850</span></h2></a></td>' +
      '<td><span class="label">Date</span><div class="ellipsis">1850</div></td>' +
      "</tr></table>";

    const [registre] = analyserResultats(html, "59", "Lille");

    expect(registre?.anneeDebut).toBe(1850);
    expect(registre?.anneeFin).toBe(1850);
  });
});

describe("creerConnecteurPortailRechercheAvancee", () => {
  function creerRecupererPageFactice(pagesParUrl: Record<string, string>) {
    const urlsAppelees: string[] = [];
    const recupererPage = async (url: string): Promise<string> => {
      urlsAppelees.push(url);
      const cle = Object.keys(pagesParUrl).find((prefixe) => url.startsWith(prefixe));
      if (!cle) {
        throw new Error(`Aucune page factice configurée pour l'URL : ${url}`);
      }
      return pagesParUrl[cle];
    };
    return { recupererPage, urlsAppelees };
  }

  it("récupère le formulaire puis les résultats, et transmet la bonne valeur de commune", async () => {
    const { recupererPage, urlsAppelees } = creerRecupererPageFactice({
      "https://archivesdepartementales.lenord.fr/search/form/abc": formulaireNord,
      "https://archivesdepartementales.lenord.fr/search/results": resultatsNord,
    });

    const connecteur = creerConnecteurPortailRechercheAvancee(
      { code: "59", nom: "Nord", baseUrl: "https://archivesdepartementales.lenord.fr", formUuid: "abc" },
      recupererPage,
    );

    const resultats = await connecteur.rechercherRegistres({ commune: "lille" });

    expect(urlsAppelees).toHaveLength(2);
    expect(urlsAppelees[0]).toBe("https://archivesdepartementales.lenord.fr/search/form/abc");
    const urlResultats = new URL(urlsAppelees[1]);
    expect(urlResultats.searchParams.get("0-controlledAccessGeographicName")).toBe("LILLE");
    expect(urlResultats.searchParams.get("mode")).toBe("table");
    expect(resultats[0]?.titre).toBe("LILLE / N (désordre) [1793-1796]");
  });

  it("ne recherche pas les résultats si la commune ne correspond à aucune option connue", async () => {
    const { recupererPage, urlsAppelees } = creerRecupererPageFactice({
      "https://archivesdepartementales.lenord.fr/search/form/abc": formulaireNord,
      "https://archivesdepartementales.lenord.fr/search/results": resultatsNord,
    });

    const connecteur = creerConnecteurPortailRechercheAvancee(
      { code: "59", nom: "Nord", baseUrl: "https://archivesdepartementales.lenord.fr", formUuid: "abc" },
      recupererPage,
    );

    const resultats = await connecteur.rechercherRegistres({ commune: "Commune Imaginaire Xyz" });

    expect(resultats).toEqual([]);
    expect(urlsAppelees).toHaveLength(1);
  });

  it("ignore le filtre de type d'acte quand aucune option ne correspond, plutôt que de forcer une recherche impossible", async () => {
    const { recupererPage, urlsAppelees } = creerRecupererPageFactice({
      "https://archivesdepartementales.lenord.fr/search/form/abc": formulaireNord,
      "https://archivesdepartementales.lenord.fr/search/results": resultatsNord,
    });

    const connecteur = creerConnecteurPortailRechercheAvancee(
      { code: "59", nom: "Nord", baseUrl: "https://archivesdepartementales.lenord.fr", formUuid: "abc" },
      recupererPage,
    );

    await connecteur.rechercherRegistres({ commune: "Lille", typeActe: "table_decennale" });

    const urlResultats = new URL(urlsAppelees[1]);
    expect(urlResultats.searchParams.has("1-controlledAccessPhysicalCharacteristic")).toBe(false);
  });

  it("transmet une période complète lorsque anneeDebut et anneeFin sont fournis", async () => {
    const { recupererPage, urlsAppelees } = creerRecupererPageFactice({
      "https://archivesdepartementales.lenord.fr/search/form/abc": formulaireNord,
      "https://archivesdepartementales.lenord.fr/search/results": resultatsNord,
    });

    const connecteur = creerConnecteurPortailRechercheAvancee(
      { code: "59", nom: "Nord", baseUrl: "https://archivesdepartementales.lenord.fr", formUuid: "abc" },
      recupererPage,
    );

    await connecteur.rechercherRegistres({ commune: "Lille", anneeDebut: 1800, anneeFin: 1810 });

    const urlResultats = new URL(urlsAppelees[1]);
    expect(urlResultats.searchParams.get("3-date_begin")).toBe("1800");
    expect(urlResultats.searchParams.get("3-date_end")).toBe("1810");
  });

  it("transmet toutes les options du formulaire qui correspondent au type d'acte demandé", async () => {
    const { recupererPage, urlsAppelees } = creerRecupererPageFactice({
      "https://archivesdepartementales.lenord.fr/search/form/abc": formulaireNord,
      "https://archivesdepartementales.lenord.fr/search/results": resultatsNord,
    });

    const connecteur = creerConnecteurPortailRechercheAvancee(
      { code: "59", nom: "Nord", baseUrl: "https://archivesdepartementales.lenord.fr", formUuid: "abc" },
      recupererPage,
    );

    await connecteur.rechercherRegistres({ commune: "Lille", typeActe: "naissance" });

    const urlResultats = new URL(urlsAppelees[1]);
    expect(urlResultats.searchParams.getAll("1-controlledAccessPhysicalCharacteristic")).toEqual([
      "Baptêmes",
      "Naissances",
    ]);
  });

  it("transmet une année exacte quand seul anneeDebut est fourni", async () => {
    const { recupererPage, urlsAppelees } = creerRecupererPageFactice({
      "https://archivesdepartementales.lenord.fr/search/form/abc": formulaireNord,
      "https://archivesdepartementales.lenord.fr/search/results": resultatsNord,
    });

    const connecteur = creerConnecteurPortailRechercheAvancee(
      { code: "59", nom: "Nord", baseUrl: "https://archivesdepartementales.lenord.fr", formUuid: "abc" },
      recupererPage,
    );

    await connecteur.rechercherRegistres({ commune: "Lille", anneeDebut: 1850 });

    const urlResultats = new URL(urlsAppelees[1]);
    expect(urlResultats.searchParams.get("2-date")).toBe("1850");
    expect(urlResultats.searchParams.has("3-date_begin")).toBe(false);
  });

  describe("récupération des pages par défaut (fetch)", () => {
    const config = { code: "59", nom: "Nord", baseUrl: "https://archivesdepartementales.lenord.fr", formUuid: "abc" };

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("télécharge le formulaire puis les résultats en s'identifiant par son User-Agent", async () => {
      const fetchFactice = vi.fn(async (url: string, _options?: unknown) => ({
        ok: true,
        status: 200,
        text: async () => (url.includes("/search/form/") ? formulaireNord : resultatsNord),
      }));
      vi.stubGlobal("fetch", fetchFactice);

      const resultats = await creerConnecteurPortailRechercheAvancee(config).rechercherRegistres({ commune: "Lille" });

      expect(fetchFactice).toHaveBeenCalledTimes(2);
      expect(fetchFactice.mock.calls[0]?.[0]).toBe("https://archivesdepartementales.lenord.fr/search/form/abc");
      const enTetes = (fetchFactice.mock.calls[0]?.[1] as { headers: Record<string, string> }).headers;
      expect(enTetes["User-Agent"]).toContain("claude-mcp-genealogy");
      expect(resultats[0]?.titre).toBe("LILLE / N (désordre) [1793-1796]");
    });

    it("signale une réponse HTTP en erreur avec son code", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({ ok: false, status: 503, text: async () => "" })),
      );

      await expect(creerConnecteurPortailRechercheAvancee(config).rechercherRegistres({ commune: "Lille" })).rejects.toThrow(
        "HTTP 503",
      );
    });
  });
});
