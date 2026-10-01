import { ParkMatch } from "@deckforge/engine";
import { describe, expect, it } from "vitest";
import { anatomyPark } from "./catalog";

describe("Анатомический парк", () => {
  it("собирается из разных тайлов и доигрывается компьютером", () => {
    const kinds = new Set(anatomyPark.tiles.map((tile) => tile.kind));
    expect(kinds).toEqual(new Set(["attraction", "food", "ride", "transit", "exit", "focus"]));
    expect(new Set(anatomyPark.tiles.map((tile) => tile.id)).size).toBe(anatomyPark.tiles.length);
    expect(anatomyPark.characters.map((character) => character.id)).toEqual(["rick", "morty", "summer", "beth"]);
    expect(anatomyPark.reactions.filter((reaction) => reaction.effect === "heart").reduce((sum, reaction) => sum + reaction.copies, 0)).toBe(2);
    expect(anatomyPark.playerCount).toEqual({ min: 1, max: 4 });

    const match = ParkMatch.create(anatomyPark, {
      seed: 4,
      players: [
        { name: "Рик", controller: "ai", characterId: "rick" },
        { name: "Морти", controller: "ai", characterId: "morty" },
      ],
    });
    const state = match.getState();
    expect(state.status).toBe("over");
    expect(state.outcome?.winnerIds.length).toBeGreaterThan(0);
    expect(state.log.length).toBeGreaterThan(5);
    expect(Object.keys(state.ground).length).toBeGreaterThan(1);
  });
});
