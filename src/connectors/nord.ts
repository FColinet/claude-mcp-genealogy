import { creerConnecteurPortailRechercheAvancee } from "./portailRechercheAvancee.js";
import type { DepartementConnector } from "./types.js";

/**
 * UUID du formulaire "Actes paroissiaux et d'état civil - Recherche ciblée",
 * relevé sur https://archivesdepartementales.lenord.fr/search/form/dc4e871d-0b62-41fb-9921-5ded573781b8
 */
const FORM_UUID = "dc4e871d-0b62-41fb-9921-5ded573781b8";

export function creerConnecteurNord(): DepartementConnector {
  return creerConnecteurPortailRechercheAvancee({
    code: "59",
    nom: "Nord",
    baseUrl: "https://archivesdepartementales.lenord.fr",
    formUuid: FORM_UUID,
  });
}
