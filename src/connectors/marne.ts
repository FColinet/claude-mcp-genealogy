import { creerConnecteurPortailRechercheAvancee } from "./portailRechercheAvancee.js";
import type { DepartementConnector } from "./types.js";

/**
 * UUID du formulaire "État civil - Recherche ciblée",
 * relevé sur https://archives.marne.fr/search/form/6977c5eb-072c-470c-8dfa-6d6488a2d71e
 */
const FORM_UUID = "6977c5eb-072c-470c-8dfa-6d6488a2d71e";

export function creerConnecteurMarne(): DepartementConnector {
  return creerConnecteurPortailRechercheAvancee({
    code: "51",
    nom: "Marne",
    baseUrl: "https://archives.marne.fr",
    formUuid: FORM_UUID,
  });
}
