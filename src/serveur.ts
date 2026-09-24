import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ConnecteurInconnuError, RegistreConnecteurs } from "./connectors/registry.js";
import { rechercherRegistres } from "./outils/rechercherRegistres.js";

const TYPES_ACTE = ["naissance", "mariage", "deces", "table_decennale"] as const;

export function creerServeur(registre: RegistreConnecteurs): McpServer {
  const server = new McpServer({ name: "claude-mcp-genealogy", version: "0.1.0" });

  server.registerTool(
    "rechercher_registres_etat_civil",
    {
      title: "Rechercher des registres d'état civil",
      description:
        "Recherche les registres d'état civil numérisés (naissances, mariages, décès, tables décennales) " +
        "disponibles dans les archives départementales françaises, pour une commune et un département donnés.",
      inputSchema: {
        departement: z.string().describe('Code du département, ex: "59" pour le Nord'),
        commune: z.string().describe("Nom de la commune recherchée"),
        typeActe: z.enum(TYPES_ACTE).optional().describe("Type d'acte recherché"),
        anneeDebut: z.number().int().optional().describe("Première année de la période recherchée"),
        anneeFin: z.number().int().optional().describe("Dernière année de la période recherchée"),
      },
    },
    async ({ departement, commune, typeActe, anneeDebut, anneeFin }) => {
      try {
        const resultats = await rechercherRegistres(registre, departement, {
          commune,
          typeActe,
          anneeDebut,
          anneeFin,
        });
        return {
          content: [{ type: "text" as const, text: JSON.stringify(resultats, null, 2) }],
        };
      } catch (erreur) {
        if (erreur instanceof ConnecteurInconnuError) {
          return {
            content: [{ type: "text" as const, text: erreur.message }],
            isError: true,
          };
        }
        throw erreur;
      }
    },
  );

  server.registerTool(
    "lister_departements_disponibles",
    {
      title: "Lister les départements disponibles",
      description: "Liste les départements pour lesquels ce serveur peut rechercher des registres d'état civil.",
      inputSchema: {},
    },
    async () => {
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(registre.departementsDisponibles(), null, 2) },
        ],
      };
    },
  );

  return server;
}
