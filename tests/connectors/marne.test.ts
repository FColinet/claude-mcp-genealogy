import { describe, expect, it } from "vitest";
import { creerConnecteurMarne } from "../../src/connectors/marne.js";

describe("creerConnecteurMarne", () => {
  it("expose le bon code et nom de département", () => {
    const connecteur = creerConnecteurMarne();
    expect(connecteur.code).toBe("51");
    expect(connecteur.nom).toBe("Marne");
  });
});
