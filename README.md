# claude-mcp-genealogy

Serveur [MCP](https://modelcontextprotocol.io/) pour la recherche généalogique : il expose des outils permettant à Claude d'interroger les registres d'état civil numérisés (naissances, mariages, décès, tables décennales, registres paroissiaux) par les archives départementales françaises et les Archives de l'État en Belgique.

## Pourquoi un serveur par connecteur

Il n'existe pas d'API nationale unique pour l'état civil numérisé : chaque service d'archives départementales publie ses propres registres sur son propre portail, avec sa propre structure (URLs, formulaires, formats de résultats). Certains départements (Alpes-de-Haute-Provence, Côtes-d'Armor...) publient en plus un inventaire ouvert sur data.gouv.fr, mais ce n'est pas systématique.

Ce serveur adopte donc une architecture en **connecteurs** : chaque département supporté a son propre module qui sait interroger son portail et retourner des résultats dans un format commun. Le serveur MCP expose des outils génériques qui délèguent au bon connecteur selon le code du département demandé.

## Statut actuel

- [x] Socle du serveur MCP (outils `rechercher_registres_etat_civil` et `lister_departements_disponibles`)
- [x] Connecteur Nord (59)
- [x] Connecteur Marne (51)
- [x] Connecteur Belgique (`BE`) — **provisoire, voir avertissement ci-dessous**
- [ ] Aisne (02) — **non implémenté délibérément** : la recherche passe par un portail protégé par [Anubis](https://github.com/TecharoHQ/anubis), un anti-bot dont la page d'accueil déclare explicitement viser à contrer le scraping par les IA. Contourner cette protection irait à l'encontre d'une volonté explicite de l'éditeur du site.
- [ ] Pas-de-Calais (62) — **non implémenté délibérément** : identifié comme pertinent par un arbre généalogique réel, mais la recherche de registres passe systématiquement par `archivesenligne.pasdecalais.fr`, protégé par un anti-bot commercial (F5/Distil, cookies `TSPD`) qui bloque tout client non-navigateur, y compris après obtention des cookies de session. Même politique de non-contournement que pour l'Aisne.
- [ ] Italie (Portale Antenati, `antenati.cultura.gov.it`) — **non implémentée** : au 5 octobre 2026, toute requête (y compris `/robots.txt`) reçoit un `403 Forbidden` générique d'un répartiteur de charge AWS (`awselb/2.0`), aussi bien depuis un environnement cloud que depuis un poste personnel avec `curl`, y compris avec un User-Agent qui s'identifie honnêtement. Aucun défi JavaScript ni anti-bot connu (Anubis, F5/Distil, DataDome) n'a été observé, mais il n'a pas été établi s'il s'agit d'un simple pare-feu générique ou d'un blocage voulu des accès automatisés, et le comportement dans un navigateur n'a pas été vérifié. Aucune tentative d'imiter un navigateur n'a été faite. Pistes : contacter les responsables du portail, ou capturer de vraies pages dans un navigateur comme fixtures avant de décider.

Le Nord et la Marne partagent la même famille de portail de recherche avancée (`src/connectors/portailRechercheAvancee.ts`) : formulaire à `/search/form/<uuid>`, résultats à `/search/results`. Le connecteur analyse le formulaire à chaque recherche (noms de champs, liste des communes valides) plutôt que de figer des index de champs en dur, car ceux-ci diffèrent d'un département à l'autre et peuvent changer.

**Principe de non-contournement des protections anti-bot :** quand la recherche d'état civil d'un département passe par un système de protection délibérément conçu pour bloquer les accès automatisés (Anubis, F5/Distil, DataDome, etc.), ce projet ne cherche pas à le contourner (résolution du challenge JS via navigateur headless, etc.), même pour un usage personnel légitime. Un simple pare-feu générique (type Cloudflare basique, sans challenge JS) n'entre pas dans ce cas.

### Le connecteur Belgique (`BE`)

Les Archives de l'État en Belgique publient leur recherche généalogique sur **agatha.arch.be** (qui a remplacé l'ancien portail `search.arch.be`/DemoGenVisu, mis hors service depuis le 1ᵉʳ janvier 2026). Contrairement au Nord/à la Marne, ce n'est pas un simple formulaire HTML : c'est une application JavaScript complète, et une recherche nécessite un compte personnel. Le connecteur (`src/connectors/agathaPilote.ts`) pilote donc un vrai navigateur via [Playwright](https://playwright.dev/) — se connecter, remplir le formulaire, cliquer — plutôt que d'imiter des requêtes HTTP.

Ce n'est **pas** un contournement d'anti-bot comme pour l'Aisne/le Pas-de-Calais : il n'y a aucune protection anti-automatisation sur la connexion ni sur la recherche (seuls la création de compte et le mot de passe oublié utilisent un reCAPTCHA, jamais utilisés par ce connecteur). C'est une automatisation, avec les identifiants de l'utilisateur, d'un usage tout à fait normal du site.

**Configuration requise** (variables d'environnement, jamais stockées dans le code ni transmises ailleurs qu'à agatha.arch.be) :

```bash
export AGATHA_USERNAME="votre identifiant"
export AGATHA_PASSWORD="votre mot de passe"
```

Un compte gratuit se crée sur https://agatha.arch.be. Le navigateur Chromium doit être installé (`npx playwright install chromium`) sur la machine qui exécute le serveur.

**⚠️ Avertissement — partie non vérifiée avec un compte réel :** la connexion, la sélection de commune (via la modale d'autocomplétion) et le remplissage des filtres (type d'acte, année exacte) ont été vérifiés contre le site réel. En revanche, **l'extraction des résultats après soumission du formulaire n'a pas pu être vérifiée** : elle nécessite un compte agatha.arch.be valide, et les tests menés depuis cet environnement de développement se sont heurtés à un réseau proxy instable (délais, échecs de chargement aléatoires) qui a empêché d'observer une page de résultats réelle. Le code (`extraireResultats` dans `agathaPilote.ts`) tente de reconnaître un tableau HTML de résultats ou un message « aucun résultat » ; s'il ne reconnaît ni l'un ni l'autre, il lève une erreur explicite (`ResultatsAgathaNonReconnusError`) avec un extrait de la page plutôt que de renvoyer un résultat silencieusement faux. **Il faudra tester ce connecteur avec un vrai compte et ajuster `extraireResultats` si nécessaire** — c'est la seule partie du projet qui n'a pas été validée contre des données réelles.

Le filtrage par plage d'années (bornes différentes) n'est pas non plus implémenté avec certitude et est actuellement ignoré silencieusement (seule l'année exacte, quand `anneeDebut` = `anneeFin`, est transmise) : la structure précise des champs de période n'a pas pu être confirmée.

## Prérequis

- Node.js ≥ 18
- Pour le connecteur Belgique uniquement : Chromium installé pour Playwright (`npx playwright install chromium`) et un compte sur https://agatha.arch.be

## Installation

```bash
npm install
```

## Développement

```bash
npm run dev        # démarre le serveur en mode développement (stdio)
npm test           # exécute la suite de tests (Vitest)
npm run test:watch # tests en mode watch
npm run test:coverage # tests + rapport de couverture (échoue sous 80 %)
npm run lint        # vérification des types TypeScript (strict)
npm run build       # compile vers dist/
```

Ce projet suit une démarche **TDD** : chaque nouveau connecteur ou outil doit être accompagné de tests écrits avant l'implémentation. La couverture doit rester **≥ 80 %** (instructions, branches, fonctions, lignes) : le seuil est configuré dans `vitest.config.ts` et `npm run test:coverage` échoue en dessous. Le point d'entrée `src/index.ts` en est exclu (simple assemblage du serveur et du transport stdio). Les tests du pilote Playwright (`tests/connectors/agathaPilote.test.ts`) utilisent une page factice : ils vérifient le scénario de pilotage, pas le comportement réel du site agatha.arch.be.

## Architecture

```
src/
  types.ts                        # types du domaine (RegistreTrouve, RechercheRegistreQuery...)
  connectors/
    types.ts                      # interface DepartementConnector
    registry.ts                   # registre associant un code département à son connecteur
    portailRechercheAvancee.ts    # connecteur générique pour la famille de portails /search/form + /search/results
    nord.ts, marne.ts             # configuration (baseUrl, formUuid) de chaque département sur ce portail
    belgique.ts                   # orchestration du connecteur Belgique (identifiants, choix paroissial/état civil)
    agathaPilote.ts                # pilotage Playwright du site agatha.arch.be (SPA authentifiée)
  outils/
    rechercherRegistres.ts        # logique de dispatch vers le bon connecteur
  serveur.ts                       # construction du serveur MCP (outils exposés)
  index.ts                         # point d'entrée (transport stdio)
tests/
  fixtures/<departement>/          # pages HTML réelles utilisées comme fixtures de test (formulaire, résultats)
```

## Ajouter un nouveau département

1. Vérifier d'abord qu'aucune protection anti-bot délibérée (Anubis, F5/Distil, DataDome...) ne protège la recherche — voir « Principe de non-contournement » ci-dessus. Si c'est le cas, ne pas implémenter de connecteur ; documenter le constat dans ce README.
2. Vérifier si le portail utilise la même famille que le Nord/la Marne (URL de recherche avancée de la forme `/search/form/<uuid>`, résultats à `/search/results`). Si oui, il suffit d'ajouter un fichier `src/connectors/<code>.ts` qui appelle `creerConnecteurPortailRechercheAvancee({ code, nom, baseUrl, formUuid })` avec l'UUID relevé sur le site (voir `nord.ts`/`marne.ts` comme modèles) et de sauvegarder des fixtures réelles dans `tests/fixtures/<code>/`.
3. Si le portail est une application JavaScript nécessitant une authentification (comme Agatha), s'inspirer de `belgique.ts`/`agathaPilote.ts` : séparer l'orchestration (testable avec un pilote factice, sans navigateur réel) du pilotage Playwright proprement dit.
4. Sinon (autre logiciel classique), écrire d'abord les tests dans `tests/connectors/<code>.test.ts` à partir d'échantillons HTML/JSON réels du site, avant d'implémenter le connecteur (TDD), en exportant un objet conforme à `DepartementConnector`.
5. Enregistrer le connecteur dans `src/index.ts` via `registre.enregistrer(...)`.
6. Mettre à jour la section « Statut actuel » de ce README.

## Déploiement

Ce serveur n'est pas un service à héberger : il utilise le transport **stdio** (`src/index.ts`) et est lancé comme sous-processus par le client MCP (Claude Desktop, Claude Code...) sur la machine de l'utilisateur. Il n'existe à ce jour ni transport HTTP, ni image Docker, ni publication npm.

### 1. Installer et compiler

```bash
npm install
npm run build                     # produit dist/index.js
npx playwright install chromium   # uniquement pour le connecteur Belgique
```

Après toute modification du code, relancer `npm run build` puis redémarrer le client MCP.

### 2. Déclarer le serveur dans le client

**Claude Code** (les options `--env` se placent avant le nom du serveur ; elles ne sont utiles que pour la Belgique) :

```bash
claude mcp add --env AGATHA_USERNAME=... --env AGATHA_PASSWORD=... \
  genealogy -- node /chemin/absolu/claude-mcp-genealogy/dist/index.js
```

**Claude Desktop** : ajouter le serveur à `claude_desktop_config.json` (Windows : `%APPDATA%\Claude\`, macOS : `~/Library/Application Support/Claude/`), puis redémarrer l'application :

```json
{
  "mcpServers": {
    "genealogy": {
      "command": "node",
      "args": ["/chemin/absolu/claude-mcp-genealogy/dist/index.js"],
      "env": {
        "AGATHA_USERNAME": "votre identifiant",
        "AGATHA_PASSWORD": "votre mot de passe"
      }
    }
  }
}
```

Sous Windows, écrire le chemin avec des `/` (`C:/Users/.../dist/index.js`) ou doubler les `\`.

### 3. Identifiants du connecteur Belgique

`AGATHA_USERNAME` et `AGATHA_PASSWORD` ne sont lues qu'au moment d'une recherche sur `BE`, pas au démarrage : sans elles, le serveur démarre normalement, le Nord et la Marne fonctionnent, et seule une requête Belgique échoue avec une erreur explicite. Attention : placées dans la configuration du client, elles sont stockées en clair dans ce fichier.

### 4. Vérifier l'installation

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

L'inspecteur MCP ouvre une interface web permettant d'appeler les outils : `lister_departements_disponibles` doit lister les trois connecteurs enregistrés (Nord, Marne, Belgique), et `rechercher_registres_etat_civil` avec `departement: "59"` et `commune: "Lille"` doit renvoyer des registres réels.

## Outils MCP exposés

### `rechercher_registres_etat_civil`

Recherche les registres d'état civil numérisés pour une commune donnée.

| Paramètre    | Type   | Obligatoire | Description                                            |
|--------------|--------|-------------|----------------------------------------------------------|
| `departement`| string | oui         | Code du département (ex. `"59"` pour le Nord) ou `"BE"` pour la Belgique |
| `commune`    | string | oui         | Nom de la commune                                         |
| `typeActe`   | enum   | non         | `naissance`, `mariage`, `deces` ou `table_decennale`      |
| `anneeDebut` | number | non         | Première année de la période recherchée                   |
| `anneeFin`   | number | non         | Dernière année de la période recherchée                   |

Renvoie une liste de registres, chacun avec : `departement`, `commune`, `titre` (intitulé du registre sur le site source), `typesActes` (liste de libellés bruts — un registre ancien couvre souvent plusieurs types d'actes à la fois, ex. `["baptêmes - naissances", "mariages", "sépultures - décès"]`), `anneeDebut`, `anneeFin`, `cote` (cote d'archive), `lieu` (lieu tel qu'indiqué par la source) et `url` (lien vers la notice/visionneuse).

Le paramètre `typeActe` en entrée est une catégorie simplifiée ; le connecteur la fait correspondre aux libellés réels du département interrogé (ex. « Naissances » et « Baptêmes » pour le Nord, « baptêmes - naissances » pour la Marne). Si le département ne propose pas ce type d'acte, le filtre est simplement ignoré plutôt que de forcer une recherche sans résultat.

### `lister_departements_disponibles`

Liste les départements pour lesquels ce serveur dispose d'un connecteur fonctionnel.
