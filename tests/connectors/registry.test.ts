import { describe, expect, it } from "vitest";
import { ConnecteurInconnuError, RegistreConnecteurs } from "../../src/connectors/registry.js";
import type { DepartementConnector } from "../../src/connectors/types.js";

function creerConnecteurFactice(code: string, nom: string): DepartementConnector {
  return {
    code,
    nom,
    async rechercherRegistres() {
      return [];
    },
  };
}

describe("RegistreConnecteurs", () => {
  it("retrouve un connecteur enregistré par son code département", () => {
    const registre = new RegistreConnecteurs();
    const connecteurNord = creerConnecteurFactice("59", "Nord");
    registre.enregistrer(connecteurNord);

    expect(registre.obtenir("59")).toBe(connecteurNord);
  });

  it("lève une erreur explicite si le département n'a pas de connecteur", () => {
    const registre = new RegistreConnecteurs();

    expect(() => registre.obtenir("75")).toThrow(ConnecteurInconnuError);
    expect(() => registre.obtenir("75")).toThrow('département "75"');
  });

  it("liste les départements disponibles dans l'ordre d'enregistrement", () => {
    const registre = new RegistreConnecteurs();
    registre.enregistrer(creerConnecteurFactice("59", "Nord"));
    registre.enregistrer(creerConnecteurFactice("02", "Aisne"));

    expect(registre.departementsDisponibles()).toEqual([
      { code: "59", nom: "Nord" },
      { code: "02", nom: "Aisne" },
    ]);
  });
});
