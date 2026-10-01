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
    const decks = hogwartsModule.config.heroes.map((hero) => JSON.stringify(hero.startingDeck));
    expect(new Set(decks).size).toBe(hogwartsModule.config.heroes.length);
    const dungeons = hogwartsModule.config.cards.find((card) => card.id === "hp-dungeons");
    const hall = hogwartsModule.config.cards.find((card) => card.id === "hp-hall");
    expect(hall?.enemyCount).toBeGreaterThan(dungeons?.enemyCount ?? 0);
    expect(hall?.eventCount).toBeGreaterThan(dungeons?.eventCount ?? 0);
    expect(hall?.effects?.some((block) => block.trigger === "onTurnStart")).toBe(true);
    expect(hogwartsModule.config.cards.find((card) => card.id === "hp-ally")?.stays).toBe(true);

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
