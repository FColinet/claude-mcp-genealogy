# claude-mcp-genealogy

Serveur [MCP](https://modelcontextprotocol.io/) pour la recherche généalogique : il expose des outils permettant à Claude d'interroger les registres d'état civil numérisés par les archives départementales françaises (naissances, mariages, décès, tables décennales).

## Pourquoi un serveur par connecteur

Il n'existe pas d'API nationale unique pour l'état civil numérisé : chaque service d'archives départementales publie ses propres registres sur son propre portail, avec sa propre structure (URLs, formulaires, formats de résultats). Certains départements (Alpes-de-Haute-Provence, Côtes-d'Armor...) publient en plus un inventaire ouvert sur data.gouv.fr, mais ce n'est pas systématique.

Ce serveur adopte donc une architecture en **connecteurs** : chaque département supporté a son propre module qui sait interroger son portail et retourner des résultats dans un format commun. Le serveur MCP expose des outils génériques qui délèguent au bon connecteur selon le code du département demandé.

## Statut actuel

- [x] Socle du serveur MCP (outils `rechercher_registres_etat_civil` et `lister_departements_disponibles`)
- [ ] Connecteur Nord (59)
- [ ] Connecteur Aisne (02)
- [ ] Connecteur Marne (51)

Aucun connecteur départemental n'est encore branché : `lister_departements_disponibles` renvoie donc une liste vide tant que le premier connecteur n'est pas enregistré dans `src/index.ts`.

## Prérequis

- Node.js ≥ 18

## Installation

```bash
npm install
```

## Développement

```bash
npm run dev        # démarre le serveur en mode développement (stdio)
npm test           # exécute la suite de tests (Vitest)
npm run test:watch # tests en mode watch
npm run lint        # vérification des types TypeScript (strict)
npm run build       # compile vers dist/
```

Ce projet suit une démarche **TDD** : chaque nouveau connecteur ou outil doit être accompagné de tests écrits avant l'implémentation.

## Architecture

```
src/
  types.ts                 # types du domaine (RegistreTrouve, RechercheRegistreQuery...)
  connectors/
    types.ts               # interface DepartementConnector
    registry.ts            # registre associant un code département à son connecteur
    <departement>.ts       # un module par département supporté (à venir)
  outils/
    rechercherRegistres.ts # logique de dispatch vers le bon connecteur
  serveur.ts                # construction du serveur MCP (outils exposés)
  index.ts                  # point d'entrée (transport stdio)
```

## Ajouter un nouveau département

1. Créer `src/connectors/<code>.ts` exportant un objet conforme à `DepartementConnector` (`code`, `nom`, `rechercherRegistres`).
2. Écrire d'abord les tests dans `tests/connectors/<code>.test.ts`, à partir d'échantillons réels (HTML/JSON) du portail concerné, avant d'écrire le code du connecteur (TDD).
3. Enregistrer le connecteur dans `src/index.ts` via `registre.enregistrer(...)`.
4. Mettre à jour la section « Statut actuel » de ce README.

## Utilisation avec Claude Desktop / Claude Code

Une fois le projet buildé (`npm run build`), ajouter le serveur à la configuration MCP du client (par exemple `claude_desktop_config.json`) :

```json
{
  "mcpServers": {
    "genealogy": {
      "command": "node",
      "args": ["/chemin/absolu/vers/claude-mcp-genealogy/dist/index.js"]
    }
  }
}
```

## Outils MCP exposés

### `rechercher_registres_etat_civil`

Recherche les registres d'état civil numérisés pour une commune donnée.

| Paramètre    | Type   | Obligatoire | Description                                            |
|--------------|--------|-------------|----------------------------------------------------------|
| `departement`| string | oui         | Code du département, ex. `"59"` pour le Nord             |
| `commune`    | string | oui         | Nom de la commune                                         |
| `typeActe`   | enum   | non         | `naissance`, `mariage`, `deces` ou `table_decennale`      |
| `anneeDebut` | number | non         | Première année de la période recherchée                   |
| `anneeFin`   | number | non         | Dernière année de la période recherchée                   |

### `lister_departements_disponibles`

Liste les départements pour lesquels ce serveur dispose d'un connecteur fonctionnel.
