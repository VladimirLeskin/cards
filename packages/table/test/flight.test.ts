import { describe, expect, it } from "vitest";
import { flightDelta, flightPlans, keepFlights, visibleCardIds } from "../src/flight";
import type { ClientView } from "@deckforge/engine";

describe("card flights", () => {
  it("sends a played card into the play row and a purchase into the discard", () => {
    expect(flightPlans({ type: "playCard", playerId: "p1", instanceId: "c1" }, "discard")).toEqual([
      { instanceId: "c1", playerId: "p1", zone: "play" },
    ]);
    expect(flightPlans({ type: "buyCard", playerId: "p1", instanceId: "c2" }, "discard")).toEqual([
      { instanceId: "c2", playerId: "p1", zone: "discard" },
    ]);
    expect(flightPlans({ type: "buyCard", playerId: "p1", instanceId: "c2" }, "hand")).toEqual([
      { instanceId: "c2", playerId: "p1", zone: "hand" },
    ]);
  });

  it("sends the chosen card and the cards still in play toward the discard", () => {
    expect(flightPlans({ type: "choose", playerId: "p1", optionId: "c3" }, "discard")).toEqual([
      { instanceId: "c3", playerId: "p1", zone: "discard" },
    ]);
    expect(flightPlans({ type: "endTurn", playerId: "p1" }, "discard", ["c1", "c4"])).toEqual([
      { instanceId: "c1", playerId: "p1", zone: "discard" },
      { instanceId: "c4", playerId: "p1", zone: "discard" },
    ]);
  });

  it("keeps a discard flight only when the card left the table", () => {
    const flights = [
      { instanceId: "c1", playerId: "p1", zone: "discard" as const },
      { instanceId: "c2", playerId: "p1", zone: "play" as const },
    ];
    expect(keepFlights(flights, new Set(["c1"]))).toEqual([flights[1]]);
  });

  it("does not treat the discard pile as a visible card", () => {
    const view = {
      players: [
        {
          hand: [{ instanceId: "c1" }],
          play: [{ instanceId: "c2" }],
          discard: [{ instanceId: "c9" }],
        },
      ],
      market: [null, { instanceId: "c3" }],
      enemies: [{ instanceId: "c4" }],
      location: { instanceId: "c5" },
      eventsRevealed: [{ instanceId: "c6" }],
    } as unknown as ClientView;
    expect([...visibleCardIds(view)].sort()).toEqual(["c1", "c2", "c3", "c4", "c5", "c6"]);
  });

  it("aims the flyer at the center of the destination", () => {
    expect(
      flightDelta(
        { left: 0, top: 100, width: 160, height: 200 },
        { left: 400, top: 20, width: 80, height: 40 },
      ),
    ).toEqual({ x: 360, y: -160, scale: 0.5 });
  });
});
