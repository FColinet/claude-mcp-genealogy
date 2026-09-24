import type { DepartementConnector } from "./types.js";

export class ConnecteurInconnuError extends Error {
  constructor(code: string) {
    super(`Aucun connecteur disponible pour le département "${code}".`);
    this.name = "ConnecteurInconnuError";
  }
}

export class RegistreConnecteurs {
  private readonly connecteurs = new Map<string, DepartementConnector>();

  enregistrer(connecteur: DepartementConnector): void {
    this.connecteurs.set(connecteur.code, connecteur);
  }

  obtenir(code: string): DepartementConnector {
    const connecteur = this.connecteurs.get(code);
    if (!connecteur) {
      throw new ConnecteurInconnuError(code);
    }
    return connecteur;
  }

  departementsDisponibles(): Array<{ code: string; nom: string }> {
    return [...this.connecteurs.values()].map(({ code, nom }) => ({ code, nom }));
  }
}
