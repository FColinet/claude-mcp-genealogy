#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { creerConnecteurMarne } from "./connectors/marne.js";
import { creerConnecteurNord } from "./connectors/nord.js";
import { RegistreConnecteurs } from "./connectors/registry.js";
import { creerServeur } from "./serveur.js";

const registre = new RegistreConnecteurs();
registre.enregistrer(creerConnecteurNord());
registre.enregistrer(creerConnecteurMarne());
// L'Aisne utilise un portail différent ; son connecteur n'est pas encore implémenté.

const server = creerServeur(registre);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((erreur) => {
  console.error("Erreur fatale du serveur MCP :", erreur);
  process.exit(1);
});
