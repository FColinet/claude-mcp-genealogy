import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  creerConnecteurBelgique,
  determinerOnglets,
  IdentifiantsAgathaManquantsError,
} from "../../src/connectors/belgique.js";
import type { PiloteAgatha } from "../../src/connectors/agathaPilote.js";
import type { RegistreTrouve } from "../../src/types.js";

function creerPiloteFactice(overrides: Partial<PiloteAgatha> = {}) {
  const appels: string[] = [];
  const pilote: PiloteAgatha = {
    async connecter(nomUtilisateur, motDePasse) {
      appels.push(`connecter(${nomUtilisateur},${motDePasse})`);
    },
    async rechercherRegistresParoissiaux(query) {
      appels.push(`PR(${query.commune})`);
      return [];
    },
    async rechercherRegistresEtatCivil(query) {
      appels.push(`CS(${query.commune})`);
      return [];
    },
    async fermer() {
      appels.push("fermer()");
    },
    ...overrides,
  };
  return { pilote, appels };
}

const ANCIENNES_VARIABLES = { ...process.env };

describe("determinerOnglets", () => {
  it("choisit uniquement les registres paroissiaux avant 1796", () => {
    expect(determinerOnglets({ commune: "Rance", anneeDebut: 1750, anneeFin: 1780 })).toEqual(["PR"]);
  });

  it("choisit uniquement l'état civil à partir de 1796", () => {
    expect(determinerOnglets({ commune: "Rance", anneeDebut: 1850 })).toEqual(["CS"]);
  });

  it("choisit les deux quand la période n'est pas précisée", () => {
    expect(determinerOnglets({ commune: "Rance" })).toEqual(["PR", "CS"]);
  });

  it("choisit les deux quand la période chevauche 1796", () => {
    expect(determinerOnglets({ commune: "Rance", anneeDebut: 1790, anneeFin: 1800 })).toEqual(["PR", "CS"]);
  });
});

describe("creerConnecteurBelgique", () => {
  beforeEach(() => {
    delete process.env.AGATHA_USERNAME;
    delete process.env.AGATHA_PASSWORD;
  });

  afterEach(() => {
    process.env = { ...ANCIENNES_VARIABLES };
  });

  it("expose le code BE et un nom explicite", () => {
    const connecteur = creerConnecteurBelgique();
    expect(connecteur.code).toBe("BE");
    expect(connecteur.nom).toBe("Belgique (Archives de l'État)");
  });

  it("lève une erreur explicite si les identifiants ne sont pas configurés", async () => {
    const { pilote, appels } = creerPiloteFactice();
    const connecteur = creerConnecteurBelgique({ creerPilote: () => pilote });

    await expect(connecteur.rechercherRegistres({ commune: "Rance" })).rejects.toThrow(
      IdentifiantsAgathaManquantsError,
    );
    expect(appels).toEqual([]);
  });

  it("se connecte puis interroge les deux onglets quand la période n'est pas précisée, puis ferme le pilote", async () => {
    const { pilote, appels } = creerPiloteFactice();
    const connecteur = creerConnecteurBelgique({
      nomUtilisateur: "florent",
      motDePasse: "secret",
      creerPilote: () => pilote,
    });

    await connecteur.rechercherRegistres({ commune: "Rance" });

    expect(appels).toEqual(["connecter(florent,secret)", "PR(Rance)", "CS(Rance)", "fermer()"]);
  });

  it("n'interroge que l'état civil pour une période postérieure à 1796", async () => {
    const { pilote, appels } = creerPiloteFactice();
    const connecteur = creerConnecteurBelgique({
      nomUtilisateur: "florent",
      motDePasse: "secret",
      creerPilote: () => pilote,
    });

    await connecteur.rechercherRegistres({ commune: "Rance", anneeDebut: 1850, anneeFin: 1880 });

    expect(appels).toEqual(["connecter(florent,secret)", "CS(Rance)", "fermer()"]);
  });

  it("agrège les résultats des deux onglets", async () => {
    const registreParoissial: RegistreTrouve = {
      departement: "BE",
      commune: "Rance",
      titre: "Registre paroissial",
      typesActes: ["Baptêmes"],
      anneeDebut: 1750,
      anneeFin: 1790,
      url: "https://agatha.arch.be/exemple-pr",
    };
    const registreEtatCivil: RegistreTrouve = {
      departement: "BE",
      commune: "Rance",
      titre: "Registre état civil",
      typesActes: ["Naissances"],
      anneeDebut: 1800,
      anneeFin: 1810,
      url: "https://agatha.arch.be/exemple-cs",
    };
    const { pilote } = creerPiloteFactice({
      async rechercherRegistresParoissiaux() {
        return [registreParoissial];
      },
      async rechercherRegistresEtatCivil() {
        return [registreEtatCivil];
      },
    });
    const connecteur = creerConnecteurBelgique({
      nomUtilisateur: "florent",
      motDePasse: "secret",
      creerPilote: () => pilote,
    });

    const resultats = await connecteur.rechercherRegistres({ commune: "Rance" });

    expect(resultats).toEqual([registreParoissial, registreEtatCivil]);
  });

  it("ferme le pilote même si la recherche échoue", async () => {
    const { pilote, appels } = creerPiloteFactice({
      async rechercherRegistresParoissiaux() {
        throw new Error("panne réseau");
      },
    });
    const connecteur = creerConnecteurBelgique({
      nomUtilisateur: "florent",
      motDePasse: "secret",
      creerPilote: () => pilote,
    });

    await expect(connecteur.rechercherRegistres({ commune: "Rance" })).rejects.toThrow("panne réseau");
    expect(appels).toContain("fermer()");
  });

  it("lit les identifiants depuis les variables d'environnement si non fournis explicitement", async () => {
    process.env.AGATHA_USERNAME = "depuis-env";
    process.env.AGATHA_PASSWORD = "mdp-env";
    const { pilote, appels } = creerPiloteFactice();
    const connecteur = creerConnecteurBelgique({ creerPilote: () => pilote });

    await connecteur.rechercherRegistres({ commune: "Rance" });

    expect(appels[0]).toBe("connecter(depuis-env,mdp-env)");
  });
});
