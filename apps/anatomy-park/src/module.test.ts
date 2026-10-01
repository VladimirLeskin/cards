import { createEngine } from "@deckforge/engine";
import { describe, expect, it } from "vitest";
import { anatomyParkModule } from "./module";

describe("Анатомический парк", () => {
  it("держит свои правила и доигрывается компьютером", () => {
    expect(anatomyParkModule.config.mechanics.enemyRefill).toBe("onDefeat");
    expect(anatomyParkModule.config.mechanics.emptyEventDeck).toBe("reshuffle");
    expect(anatomyParkModule.config.mechanics.emptyEnemyDeck).toBe("reshuffle");
    expect(anatomyParkModule.config.props.map((prop) => prop.id)).toEqual(["portal-gun"]);
    expect(anatomyParkModule.config.tokens.map((token) => token.id)).toEqual(["sample"]);
    expect(anatomyParkModule.config.resources.find((resource) => resource.role === "currency")?.id).toBe("samples");
    const decks = anatomyParkModule.config.heroes.map((hero) => JSON.stringify(hero.startingDeck));
    expect(new Set(decks).size).toBe(anatomyParkModule.config.heroes.length);
    const entrance = anatomyParkModule.config.cards.find((card) => card.id === "ap-entrance");
    const core = anatomyParkModule.config.cards.find((card) => card.id === "ap-core");
    expect(core?.enemyCount).toBeGreaterThan(entrance?.enemyCount ?? 0);
    expect(core?.eventCount).toBeGreaterThan(entrance?.eventCount ?? 0);
    expect(core?.effects?.some((block) => block.trigger === "onTurnStart")).toBe(true);
    expect(anatomyParkModule.config.cards.find((card) => card.id === "ap-intern")?.stays).toBe(true);

    const match = createEngine([anatomyParkModule]).createMatch({
      gameId: "anatomy-park",
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