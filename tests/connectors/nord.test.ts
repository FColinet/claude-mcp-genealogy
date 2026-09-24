import { describe, expect, it } from "vitest";
import { creerConnecteurNord } from "../../src/connectors/nord.js";

describe("creerConnecteurNord", () => {
  it("expose le bon code et nom de département", () => {
    const connecteur = creerConnecteurNord();
    expect(connecteur.code).toBe("59");
    expect(connecteur.nom).toBe("Nord");
  });
});
