import { describe, expect, it } from "vitest";
import { ConnecteurInconnuError, RegistreConnecteurs } from "../../src/connectors/registry.js";
import type { DepartementConnector } from "../../src/connectors/types.js";
import { rechercherRegistres } from "../../src/outils/rechercherRegistres.js";
import type { RechercheRegistreQuery, RegistreTrouve } from "../../src/types.js";

function creerConnecteurFactice(
  code: string,
  resultats: RegistreTrouve[],
): DepartementConnector & { dernierQuery?: RechercheRegistreQuery } {
  const connecteur: DepartementConnector & { dernierQuery?: RechercheRegistreQuery } = {
    code,
    nom: `Département ${code}`,
    async rechercherRegistres(query) {
      connecteur.dernierQuery = query;
      return resultats;
    },
  };
  return connecteur;
}

describe("rechercherRegistres", () => {
  it("délègue la recherche au connecteur du département demandé", async () => {
    const resultatAttendu: RegistreTrouve[] = [
      {
        departement: "59",
        commune: "Lille",
        titre: "LILLE / N [1880]",
        typesActes: ["Naissances"],
        anneeDebut: 1880,
        anneeFin: 1880,
        url: "https://archivesdepartementales.lenord.fr/exemple",
      },
    ];
    const connecteur = creerConnecteurFactice("59", resultatAttendu);
    const registre = new RegistreConnecteurs();
    registre.enregistrer(connecteur);

    const query: RechercheRegistreQuery = { commune: "Lille", typeActe: "naissance", anneeDebut: 1880 };
    const resultats = await rechercherRegistres(registre, "59", query);

    expect(resultats).toBe(resultatAttendu);
    expect(connecteur.dernierQuery).toEqual(query);
  });

  it("propage une erreur explicite si aucun connecteur n'existe pour le département", async () => {
    const registre = new RegistreConnecteurs();

    await expect(rechercherRegistres(registre, "75", { commune: "Paris" })).rejects.toThrow(
      ConnecteurInconnuError,
    );
  });
});
