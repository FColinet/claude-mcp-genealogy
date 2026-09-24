# claude-mcp-genealogy

Serveur [MCP](https://modelcontextprotocol.io/) pour la recherche généalogique : il expose des outils permettant à Claude d'interroger les registres d'état civil numérisés par les archives départementales françaises (naissances, mariages, décès, tables décennales).

## Pourquoi un serveur par connecteur

Il n'existe pas d'API nationale unique pour l'état civil numérisé : chaque service d'archives départementales publie ses propres registres sur son propre portail, avec sa propre structure (URLs, formulaires, formats de résultats). Certains départements (Alpes-de-Haute-Provence, Côtes-d'Armor...) publient en plus un inventaire ouvert sur data.gouv.fr, mais ce n'est pas systématique.

Ce serveur adopte donc une architecture en **connecteurs** : chaque département supporté a son propre module qui sait interroger son portail et retourner des résultats dans un format commun. Le serveur MCP expose des outils génériques qui délèguent au bon connecteur selon le code du département demandé.

## Statut actuel

- [x] Socle du serveur MCP (outils `rechercher_registres_etat_civil` et `lister_departements_disponibles`)
- [x] Connecteur Nord (59)
- [x] Connecteur Marne (51)
- [ ] Aisne (02) — **non implémenté délibérément** : la recherche passe par un portail protégé par [Anubis](https://github.com/TecharoHQ/anubis), un anti-bot dont la page d'accueil déclare explicitement viser à contrer le scraping par les IA. Contourner cette protection irait à l'encontre d'une volonté explicite de l'éditeur du site.
- [ ] Pas-de-Calais (62) — **non implémenté délibérément** : identifié comme pertinent par un arbre généalogique réel, mais la recherche de registres passe systématiquement par `archivesenligne.pasdecalais.fr`, protégé par un anti-bot commercial (F5/Distil, cookies `TSPD`) qui bloque tout client non-navigateur, y compris après obtention des cookies de session. Même politique de non-contournement que pour l'Aisne.
- [ ] Archives de l'État en Belgique — une bonne partie de l'ascendance peut remonter au Hainaut et à la province de Namur. Contrairement aux cas ci-dessus, ce n'est pas un problème d'anti-bot : la recherche (portail `search.arch.be`) nécessite un compte personnel authentifié. Décision à prendre avec l'utilisateur avant implémentation (faut-il gérer des identifiants personnels, sous quelle forme, avec quelles garanties de sécurité).

Le Nord et la Marne partagent la même famille de portail de recherche avancée (`src/connectors/portailRechercheAvancee.ts`) : formulaire à `/search/form/<uuid>`, résultats à `/search/results`. Le connecteur analyse le formulaire à chaque recherche (noms de champs, liste des communes valides) plutôt que de figer des index de champs en dur, car ceux-ci diffèrent d'un département à l'autre et peuvent changer.

**Principe de non-contournement des protections anti-bot :** quand la recherche d'état civil d'un département passe par un système de protection délibérément conçu pour bloquer les accès automatisés (Anubis, F5/Distil, DataDome, etc.), ce projet ne cherche pas à le contourner (résolution du challenge JS via navigateur headless, etc.), même pour un usage personnel légitime. Un simple pare-feu générique (type Cloudflare basique, sans challenge JS) n'entre pas dans ce cas.

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
  types.ts                        # types du domaine (RegistreTrouve, RechercheRegistreQuery...)
  connectors/
    types.ts                      # interface DepartementConnector
    registry.ts                   # registre associant un code département à son connecteur
    portailRechercheAvancee.ts    # connecteur générique pour la famille de portails /search/form + /search/results
    nord.ts, marne.ts             # configuration (baseUrl, formUuid) de chaque département sur ce portail
  outils/
    rechercherRegistres.ts        # logique de dispatch vers le bon connecteur
  serveur.ts                       # construction du serveur MCP (outils exposés)
  index.ts                         # point d'entrée (transport stdio)
tests/
  fixtures/<departement>/          # pages HTML réelles utilisées comme fixtures de test (formulaire, résultats)
```

## Ajouter un nouveau département

1. Vérifier si le portail du département utilise la même famille que le Nord/la Marne (URL de recherche avancée de la forme `/search/form/<uuid>`, résultats à `/search/results`). Si oui, il suffit d'ajouter un fichier `src/connectors/<code>.ts` qui appelle `creerConnecteurPortailRechercheAvancee({ code, nom, baseUrl, formUuid })` avec l'UUID relevé sur le site (voir `nord.ts`/`marne.ts` comme modèles) et de sauvegarder des fixtures réelles dans `tests/fixtures/<code>/`.
2. Si le portail est différent (autre logiciel), écrire d'abord les tests dans `tests/connectors/<code>.test.ts` à partir d'échantillons HTML/JSON réels du site, avant d'implémenter le connecteur (TDD), en exportant un objet conforme à `DepartementConnector`.
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

Renvoie une liste de registres, chacun avec : `departement`, `commune`, `titre` (intitulé du registre sur le site source), `typesActes` (liste de libellés bruts — un registre ancien couvre souvent plusieurs types d'actes à la fois, ex. `["baptêmes - naissances", "mariages", "sépultures - décès"]`), `anneeDebut`, `anneeFin`, `cote` (cote d'archive), `lieu` (lieu tel qu'indiqué par la source) et `url` (lien vers la notice/visionneuse).

Le paramètre `typeActe` en entrée est une catégorie simplifiée ; le connecteur la fait correspondre aux libellés réels du département interrogé (ex. « Naissances » et « Baptêmes » pour le Nord, « baptêmes - naissances » pour la Marne). Si le département ne propose pas ce type d'acte, le filtre est simplement ignoré plutôt que de forcer une recherche sans résultat.

### `lister_departements_disponibles`

Liste les départements pour lesquels ce serveur dispose d'un connecteur fonctionnel.
