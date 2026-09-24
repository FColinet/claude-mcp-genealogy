import type { RechercheRegistreQuery, RegistreTrouve } from "../types.js";

export interface DepartementConnector {
  readonly code: string;
  readonly nom: string;
  rechercherRegistres(query: RechercheRegistreQuery): Promise<RegistreTrouve[]>;
}
