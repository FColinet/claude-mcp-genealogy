import type { RegistreConnecteurs } from "../connectors/registry.js";
import type { RechercheRegistreQuery, RegistreTrouve } from "../types.js";

export async function rechercherRegistres(
  registre: RegistreConnecteurs,
  departement: string,
  query: RechercheRegistreQuery,
): Promise<RegistreTrouve[]> {
  const connecteur = registre.obtenir(departement);
  return connecteur.rechercherRegistres(query);
}
