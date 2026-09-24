#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { creerConnecteurBelgique } from "./connectors/belgique.js";
import { creerConnecteurMarne } from "./connectors/marne.js";
import { creerConnecteurNord } from "./connectors/nord.js";
import { RegistreConnecteurs } from "./connectors/registry.js";
import { creerServeur } from "./serveur.js";

const registre = new RegistreConnecteurs();
registre.enregistrer(creerConnecteurNord());
registre.enregistrer(creerConnecteurMarne());
registre.enregistrer(creerConnecteurBelgique());
// L'Aisne et le Pas-de-Calais sont protégés par des anti-bots dédiés : voir le README.

const server = creerServeur(registre);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((erreur) => {
  console.error("Erreur fatale du serveur MCP :", erreur);
  process.exit(1);
});
