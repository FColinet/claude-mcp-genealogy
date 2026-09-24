#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { RegistreConnecteurs } from "./connectors/registry.js";
import { creerServeur } from "./serveur.js";

const registre = new RegistreConnecteurs();
// Les connecteurs départementaux (Nord, Aisne, Marne...) s'enregistrent ici
// au fur et à mesure de leur implémentation : registre.enregistrer(nouveauConnecteur);

const server = creerServeur(registre);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((erreur) => {
  console.error("Erreur fatale du serveur MCP :", erreur);
  process.exit(1);
});
