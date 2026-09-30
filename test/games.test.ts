import { describe, expect, it } from "vitest";
import { createEngine } from "../src/index.js";

describe("конфиги игр", () => {
  it("регистрирует обе игры с разной логикой поля", () => {
    const engine = createEngine();
    const ids = engine.listGames().map((game) => game.id);
    expect(ids).toEqual(["hogwarts", "anatomy-park"]);

    const hogwarts = engine.getModule("hogwarts").config;
    const anatomy = engine.getModule("anatomy-park").config;
    expect(hogwarts.mechanics.enemyRefill).toBe("never");
    expect(hogwarts.mechanics.emptyEventDeck).toBe("lose");
    expect(hogwarts.dice.map((die) => die.id)).toEqual(["house-die"]);
    expect(hogwarts.resources.find((resource) => resource.role === "currency")?.id).toBe("influence");

    expect(anatomy.mechanics.enemyRefill).toBe("onDefeat");
    expect(anatomy.mechanics.emptyEventDeck).toBe("reshuffle");
    expect(anatomy.mechanics.emptyEnemyDeck).toBe("reshuffle");
    expect(anatomy.props.map((prop) => prop.id)).toEqual(["portal-gun"]);
    expect(anatomy.tokens.map((token) => token.id)).toEqual(["sample"]);
    expect(anatomy.resources.find((resource) => resource.role === "currency")?.id).toBe("samples");

    for (const config of [hogwarts, anatomy]) {
      for (const card of config.cards) expect(card.image.length).toBeGreaterThan(0);
      expect(config.art.board.length).toBeGreaterThan(0);
      expect(config.heroes.length).toBeGreaterThanOrEqual(config.playerCount.max);
    }
  });
});
