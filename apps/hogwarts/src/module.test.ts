import { createEngine } from "@deckforge/engine";
import { describe, expect, it } from "vitest";
import { hogwartsModule } from "./module";

describe("Битва за Хогвартс", () => {
  it("держит свои правила и доигрывается компьютером", () => {
    expect(hogwartsModule.config.mechanics.enemyRefill).toBe("never");
    expect(hogwartsModule.config.mechanics.emptyEventDeck).toBe("lose");
    expect(hogwartsModule.config.dice.map((die) => die.id)).toEqual(["house-die"]);
    expect(hogwartsModule.config.resources.find((resource) => resource.role === "currency")?.id).toBe("influence");
    expect(hogwartsModule.config.heroes.length).toBeGreaterThanOrEqual(hogwartsModule.config.playerCount.max);

    const match = createEngine([hogwartsModule]).createMatch({
      gameId: "hogwarts",
      seed: 21,
      players: [
        { name: "Раз", controller: "ai" },
        { name: "Два", controller: "ai" },
      ],
    });
    expect(match.getState().status).not.toBe("playing");
    expect(match.getState().log.length).toBeGreaterThan(5);
  });
});
