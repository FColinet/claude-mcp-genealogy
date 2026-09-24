import type { RechercheRegistreQuery, RegistreTrouve } from "../types.js";
import { creerPiloteAgathaPlaywright, type PiloteAgatha } from "./agathaPilote.js";
import type { DepartementConnector } from "./types.js";

/** En Belgique, l'état civil (créé sous le régime français) démarre en 1796. */
const ANNEE_LIMITE_ETAT_CIVIL = 1796;

export class IdentifiantsAgathaManquantsError extends Error {
  constructor() {
    super(
      "Les variables d'environnement AGATHA_USERNAME et AGATHA_PASSWORD doivent être définies (compte gratuit sur " +
        "https://agatha.arch.be) pour interroger les Archives de l'État en Belgique.",
    );
    this.name = "IdentifiantsAgathaManquantsError";
  }
}

export interface OptionsConnecteurBelgique {
  nomUtilisateur?: string;
  motDePasse?: string;
  creerPilote?: () => PiloteAgatha;
}

export function determinerOnglets(query: RechercheRegistreQuery): Array<"PR" | "CS"> {
  const { anneeDebut, anneeFin } = query;
  if (anneeFin !== undefined && anneeFin < ANNEE_LIMITE_ETAT_CIVIL) {
    return ["PR"];
  }
  if (anneeDebut !== undefined && anneeDebut >= ANNEE_LIMITE_ETAT_CIVIL) {
    return ["CS"];
  }
  return ["PR", "CS"];
}

export function creerConnecteurBelgique(options: OptionsConnecteurBelgique = {}): DepartementConnector {
  return {
    code: "BE",
    nom: "Belgique (Archives de l'État)",
    async rechercherRegistres(query: RechercheRegistreQuery): Promise<RegistreTrouve[]> {
      const nomUtilisateur = options.nomUtilisateur ?? process.env.AGATHA_USERNAME;
      const motDePasse = options.motDePasse ?? process.env.AGATHA_PASSWORD;
      if (!nomUtilisateur || !motDePasse) {
        throw new IdentifiantsAgathaManquantsError();
      }

      const pilote = (options.creerPilote ?? creerPiloteAgathaPlaywright)();
      try {
        await pilote.connecter(nomUtilisateur, motDePasse);

        const resultats: RegistreTrouve[] = [];
        for (const onglet of determinerOnglets(query)) {
          const resultatsOnglet =
            onglet === "PR"
              ? await pilote.rechercherRegistresParoissiaux(query)
              : await pilote.rechercherRegistresEtatCivil(query);
          resultats.push(...resultatsOnglet);
        }
        return resultats;
      } finally {
        await pilote.fermer();
      }
    },
  };
}
