import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { RegistreConnecteurs } from "../src/connectors/registry.js";
import { creerServeur } from "../src/serveur.js";
import type { DepartementConnector } from "../src/connectors/types.js";

function creerConnecteurFactice(): DepartementConnector {
  return {
    code: "59",
    nom: "Nord",
    async rechercherRegistres(query) {
      return [
        {
          departement: "59",
          commune: query.commune,
          typeActe: query.typeActe ?? "inconnu",
          anneeDebut: query.anneeDebut ?? 1900,
          anneeFin: query.anneeFin ?? 1900,
          url: "https://archivesdepartementales.lenord.fr/exemple",
        },
      ];
    },
  };
}

async function demarrerClientEtServeur(registre: RegistreConnecteurs) {
  const server = creerServeur(registre);
  const [transportServeur, transportClient] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "client-de-test", version: "0.0.0" });
  await Promise.all([server.connect(transportServeur), client.connect(transportClient)]);
  return client;
}

function texteDe(reponse: { content: unknown }): string {
  const content = reponse.content as Array<{ type: string; text?: string }>;
  return content[0]?.text ?? "";
}

describe("serveur MCP", () => {
  it("expose rechercher_registres_etat_civil et renvoie les résultats du connecteur enregistré", async () => {
    const registre = new RegistreConnecteurs();
    registre.enregistrer(creerConnecteurFactice());
    const client = await demarrerClientEtServeur(registre);

    const reponse = await client.callTool({
      name: "rechercher_registres_etat_civil",
      arguments: { departement: "59", commune: "Lille" },
    });

    expect(reponse.isError).toBeFalsy();
    expect(JSON.parse(texteDe(reponse))).toEqual([
      {
        departement: "59",
        commune: "Lille",
        typeActe: "inconnu",
        anneeDebut: 1900,
        anneeFin: 1900,
        url: "https://archivesdepartementales.lenord.fr/exemple",
      },
    ]);
  });

  it("renvoie une erreur explicite pour un département sans connecteur", async () => {
    const registre = new RegistreConnecteurs();
    const client = await demarrerClientEtServeur(registre);

    const reponse = await client.callTool({
      name: "rechercher_registres_etat_civil",
      arguments: { departement: "75", commune: "Paris" },
    });

    expect(reponse.isError).toBe(true);
    expect(texteDe(reponse)).toContain('département "75"');
  });

  it("liste les départements disponibles via lister_departements_disponibles", async () => {
    const registre = new RegistreConnecteurs();
    registre.enregistrer(creerConnecteurFactice());
    const client = await demarrerClientEtServeur(registre);

    const reponse = await client.callTool({ name: "lister_departements_disponibles", arguments: {} });

    expect(JSON.parse(texteDe(reponse))).toEqual([{ code: "59", nom: "Nord" }]);
  });
});
