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