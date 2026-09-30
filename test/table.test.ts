import { describe, expect, it } from "vitest";
import { Match } from "../src/core/match";
import { TableSession } from "../src/core/session";
import { createEngine } from "../src/index";
import { fixtureGame } from "./fixture";

describe("мультиплеер и компьютер", () => {
  it("не даёт чужому месту отправить команду", () => {
    const match = Match.create(fixtureGame(), {
      gameId: "fixture",
      seed: 1,
      players: [
        { name: "Ада", controller: "human", heroId: "ada" },
        { name: "Бен", controller: "human", heroId: "ben" },
      ],
    });
    const table = new TableSession(match, [
      { token: "ada-token", playerId: "p1" },
      { token: "ben-token", playerId: "p2" },
    ]);
    const spoof = table.act("ben-token", { type: "endTurn", playerId: "p1" });
    expect(spoof.ok).toBe(false);
    expect(spoof.error).toBe("Seat mismatch");
    expect(table.act("nobody", { type: "endTurn", playerId: "p1" }).error).toBe("Unknown seat");
    expect(table.act("ada-token", { type: "endTurn", playerId: "p1" }).ok).toBe(true);
    expect(table.view("ben-token").activePlayerId).toBe("p2");
  });

  it("после хода человека проводит ход компьютера и возвращает очередь", () => {
    const match = Match.create(
      fixtureGame((config) => {
        config.cards.find((card) => card.id === "gate")!.health = 40;
      }),
      {
        gameId: "fixture",
        seed: 9,
        players: [
          { name: "Ада", controller: "human", heroId: "ada" },
          { name: "Бен", controller: "ai", heroId: "ben" },
        ],
      },
    );
    expect(match.getState().activePlayerIndex).toBe(0);
    const result = match.submit({ type: "endTurn", playerId: "p1" });
    expect(result.ok).toBe(true);
    const state = match.getState();
    expect(state.status).toBe("playing");
    expect(state.turn).toBe(2);
    expect(state.turnOrder[state.activePlayerIndex]).toBe("p1");
    expect(state.log.some((event) => event.message.includes("Бен"))).toBe(true);
  });

  it("доигрывает партию, где все места отданы компьютеру", () => {
    const engine = createEngine();
    for (const gameId of ["hogwarts", "anatomy-park"]) {
      const match = engine.createMatch({
        gameId,
        seed: 21,
        players: [
          { name: "Раз", controller: "ai" },
          { name: "Два", controller: "ai" },
        ],
      });
      expect(match.getState().status).not.toBe("playing");
      expect(match.getState().log.length).toBeGreaterThan(5);
    }
  });
});
