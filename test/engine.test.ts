import { describe, expect, it } from "vitest";
import { Match } from "../src/core/match.js";
import { validateModule } from "../src/core/validate.js";
import { rngFromSeed, shuffleInPlace } from "../src/core/rng.js";
import { fixtureGame } from "./fixture.js";

describe("колода и сид", () => {
  it("перемешивает одинаково при одном сиде", () => {
    const shuffle = (seed: number) => {
      const items = ["a", "b", "c", "d", "e"];
      shuffleInPlace(items, rngFromSeed(seed));
      return items;
    };
    expect(shuffle(42)).toEqual(shuffle(42));
    expect(shuffle(42)).not.toEqual(shuffle(43));
  });
});

describe("партия", () => {
  it("даёт руку, ряд рынка и первую локацию", () => {
    const match = Match.create(fixtureGame(), {
      gameId: "fixture",
      seed: 1,
      players: [{ name: "Ада", controller: "human", heroId: "ada" }],
    });
    const state = match.getState();
    expect(state.status).toBe("playing");
    expect(state.phase.id).toBe("action");
    expect(state.players.p1?.zones.hand).toHaveLength(5);
    expect(state.players.p1?.zones.deck).toHaveLength(0);
    expect(state.board.market.row[0]).toBeTruthy();
    expect(state.board.locations.active).toBeTruthy();
    expect(state.cards[state.board.locations.active!]?.definitionId).toBe("gate");
  });

  it("проходит локацию атакой и выигрывает", () => {
    const match = Match.create(
      fixtureGame((config) => {
        config.cards.find((card) => card.id === "gate")!.health = 3;
      }),
      { gameId: "fixture", seed: 1, players: [{ name: "Ада", controller: "human", heroId: "ada" }] },
    );
    const hand = [...match.getState().players.p1!.zones.hand];
    for (const instanceId of hand.slice(0, 3)) {
      const played = match.submit({ type: "playCard", playerId: "p1", instanceId });
      expect(played.ok).toBe(true);
    }
    const strike = match.legalActions("p1").find((action) => action.command.type === "assignAttack");
    expect(strike).toBeTruthy();
    const result = match.submit(strike!.command);
    expect(result.ok).toBe(true);
    expect(match.getState().status).toBe("won");
    expect(match.getState().outcome?.reason).toBe("all-locations-cleared");
  });

  it("покупает карту за монеты и отказывает без них", () => {
    const match = Match.create(
      fixtureGame((config) => {
        config.heroes[0]!.startingDeck = [{ definitionId: "purse", count: 5 }];
        config.cards.find((card) => card.id === "gate")!.health = 30;
      }),
      { gameId: "fixture", seed: 1, players: [{ name: "Ада", controller: "human", heroId: "ada" }] },
    );
    const before = match.getState();
    const marketId = before.board.market.row[0]!;
    const refused = match.submit({ type: "buyCard", playerId: "p1", instanceId: marketId });
    expect(refused.ok).toBe(false);
    expect(match.getState().players.p1?.zones.hand).toHaveLength(5);

    const played = match.submit({
      type: "playCard",
      playerId: "p1",
      instanceId: before.players.p1!.zones.hand[0]!,
    });
    expect(played.ok).toBe(true);
    const bought = match.submit({ type: "buyCard", playerId: "p1", instanceId: marketId });
    expect(bought.ok).toBe(true);
    const after = match.getState();
    expect(after.players.p1?.pools.coins).toBe(0);
    expect(after.players.p1?.zones.discard.some((id) => after.cards[id]?.definitionId === "item")).toBe(true);
    expect(after.board.market.row[0]).toBeTruthy();
    expect(after.board.market.row[0]).not.toBe(marketId);
  });

  it("не принимает ход чужого игрока", () => {
    const match = Match.create(fixtureGame(), {
      gameId: "fixture",
      seed: 2,
      players: [
        { name: "Ада", controller: "human", heroId: "ada" },
        { name: "Бен", controller: "human", heroId: "ben" },
      ],
    });
    expect(match.getState().turnOrder[match.getState().activePlayerIndex]).toBe("p1");
    const ended = match.submit({ type: "endTurn", playerId: "p1" });
    expect(ended.ok).toBe(true);
    expect(match.getState().turnOrder[match.getState().activePlayerIndex]).toBe("p2");
    const stolen = match.submit({ type: "endTurn", playerId: "p1" });
    expect(stolen.ok).toBe(false);
    expect(stolen.error).toBe("Illegal action");
    expect(match.submit({ type: "endTurn", playerId: "p2" }).ok).toBe(true);
    expect(match.getState().turn).toBe(2);
  });

  it("прячет порядок колоды и чужую руку, если так сказано в конфиге", () => {
    const match = Match.create(
      fixtureGame((config) => {
        config.mechanics.handVisibility = "owner";
        config.heroes[0]!.startingDeck = [{ definitionId: "spark", count: 8 }];
        config.mechanics.handSize = 5;
      }),
      {
        gameId: "fixture",
        seed: 4,
        players: [
          { name: "Ада", controller: "human", heroId: "ada" },
          { name: "Бен", controller: "human", heroId: "ben" },
        ],
      },
    );
    const hidden = match.getState().players.p1!.zones.deck[0]!;
    const forBen = match.view("p2");
    const ada = forBen.players.find((player) => player.id === "p1");
    expect(ada?.hand).toEqual({ hidden: true, count: 5 });
    expect(JSON.stringify(forBen)).not.toContain(hidden);
    const table = match.view();
    const openHand = table.players.find((player) => player.id === "p1")?.hand;
    expect(Array.isArray(openHand)).toBe(true);
  });

  it("сохраняет партию и продолжает с того же места", () => {
    const module = fixtureGame();
    const match = Match.create(module, {
      gameId: "fixture",
      seed: 5,
      players: [{ name: "Ада", controller: "human", heroId: "ada" }],
    });
    const card = match.getState().players.p1!.zones.hand[0]!;
    expect(match.submit({ type: "playCard", playerId: "p1", instanceId: card }).ok).toBe(true);
    const restored = Match.restore(match.serialize(), module);
    expect(restored.getState()).toEqual(match.getState());
    expect(restored.submit({ type: "endTurn", playerId: "p1" }).ok).toBe(true);
    expect(restored.getState().turn).toBe(2);
  });

  it("останавливается на выборе человека и принимает ответ", () => {
    const match = Match.create(
      fixtureGame((config) => {
        config.mechanics.eventsPerTurn = 1;
        config.piles.events = ["fork"];
      }),
      { gameId: "fixture", seed: 1, players: [{ name: "Ада", controller: "human", heroId: "ada" }] },
    );
    const pending = match.getState().pending;
    expect(pending?.prompt).toBe("Что берём?");
    expect(match.submit({ type: "endTurn", playerId: "p1" }).ok).toBe(false);
    const chosen = match.submit({ type: "choose", playerId: "p1", optionId: "attack" });
    expect(chosen.ok).toBe(true);
    expect(match.getState().pending).toBeNull();
    expect(match.getState().players.p1?.pools.attack).toBe(1);
    expect(match.getState().phase.id).toBe("action");
  });

  it("проигрывает, если колода событий пуста", () => {
    const match = Match.create(
      fixtureGame((config) => {
        config.mechanics.eventsPerTurn = 1;
        config.mechanics.emptyEventDeck = "lose";
        config.piles.events = [];
      }),
      { gameId: "fixture", seed: 1, players: [{ name: "Ада", controller: "human", heroId: "ada" }] },
    );
    expect(match.getState().status).toBe("lost");
    expect(match.getState().outcome?.reason).toBe("event-deck-empty");
  });

  it("перемешивает сброс событий заново", () => {
    const match = Match.create(
      fixtureGame((config) => {
        config.mechanics.eventsPerTurn = 1;
        config.mechanics.emptyEventDeck = "reshuffle";
        config.piles.events = ["ping"];
        config.cards.find((card) => card.id === "gate")!.health = 40;
      }),
      { gameId: "fixture", seed: 1, players: [{ name: "Ада", controller: "human", heroId: "ada" }] },
    );
    expect(match.getState().players.p1?.pools.coins).toBe(1);
    expect(match.submit({ type: "endTurn", playerId: "p1" }).ok).toBe(true);
    expect(match.getState().status).toBe("playing");
    expect(match.getState().players.p1?.pools.coins).toBe(1);
    expect(match.getState().log.filter((event) => event.type === "event")).toHaveLength(2);
  });

  it("отдаёт локацию, когда врагу некуда выйти", () => {
    const match = Match.create(
      fixtureGame((config) => {
        config.mechanics.eventsPerTurn = 1;
        config.piles.events = ["rush"];
        config.piles.enemies = ["brute", "brute"];
        config.cards.find((card) => card.id === "gate")!.enemyCount = 1;
      }),
      { gameId: "fixture", seed: 1, players: [{ name: "Ада", controller: "human", heroId: "ada" }] },
    );
    expect(match.getState().status).toBe("lost");
    expect(match.getState().outcome?.reason).toBe("locations-overrun");
  });

  it("проигрывает, если оглушены все герои", () => {
    const match = Match.create(
      fixtureGame((config) => {
        config.mechanics.eventsPerTurn = 1;
        config.piles.events = ["boom"];
        config.heroes.forEach((hero) => {
          hero.health = 1;
        });
      }),
      {
        gameId: "fixture",
        seed: 1,
        players: [
          { name: "Ада", controller: "human", heroId: "ada" },
          { name: "Бен", controller: "human", heroId: "ben" },
        ],
      },
    );
    expect(match.getState().status).toBe("lost");
    expect(match.getState().outcome?.reason).toBe("all-stunned");
  });

  it("бросает кубик, тратит жетон и вызывает обработчик игры", () => {
    const match = Match.create(
      fixtureGame(
        (config) => {
          config.dice = [
            {
              id: "coin",
              name: "Монетка",
              image: "assets/fixture/die.svg",
              description: "Всегда атака.",
              faces: [
                { id: "a", label: "Орёл", effects: [{ op: "gain", resource: "attack", amount: 1 }] },
                { id: "b", label: "Решка", effects: [{ op: "gain", resource: "attack", amount: 1 }] },
              ],
            },
          ];
          config.tokens = [
            {
              id: "chip",
              name: "Фишка",
              image: "assets/fixture/token.svg",
              description: "Атака.",
              supply: 3,
              eachPlayer: 1,
              spendEffects: [{ op: "gain", resource: "attack", amount: 1 }],
            },
          ];
          config.heroes[0]!.startingDeck = [{ definitionId: "spark", count: 5 }];
          config.cards.push({
            id: "relic",
            name: "Реликвия",
            kind: "starter",
            text: "Особый эффект.",
            image: "assets/fixture/starter.svg",
            tags: [],
            effects: [{ trigger: "onPlay", effects: [{ op: "custom", id: "boost" }] }],
          });
          config.heroes[0]!.startingDeck = [{ definitionId: "relic", count: 5 }];
        },
        {
          boost(ctx) {
            ctx.push([{ op: "gain", resource: "attack", amount: 2 }]);
          },
        },
      ),
      { gameId: "fixture", seed: 1, players: [{ name: "Ада", controller: "human", heroId: "ada" }] },
    );
    const hand = match.getState().players.p1!.zones.hand[0]!;
    expect(match.submit({ type: "playCard", playerId: "p1", instanceId: hand }).ok).toBe(true);
    expect(match.getState().players.p1?.pools.attack).toBe(2);
    expect(match.submit({ type: "rollDie", playerId: "p1", dieId: "coin" }).ok).toBe(true);
    expect(match.getState().players.p1?.pools.attack).toBe(3);
    expect(match.submit({ type: "rollDie", playerId: "p1", dieId: "coin" }).ok).toBe(false);
    expect(match.submit({ type: "spendToken", playerId: "p1", tokenId: "chip" }).ok).toBe(true);
    expect(match.getState().players.p1?.pools.attack).toBe(4);
    expect(match.getState().items.tokens.chip?.holders.p1).toBe(0);
  });

  it("отклоняет конфиг без обработчика", () => {
    const module = fixtureGame((config) => {
      config.cards[0]!.effects = [{ trigger: "onPlay", effects: [{ op: "custom", id: "missing" }] }];
    });
    expect(validateModule(module).some((error) => error.includes("missing"))).toBe(true);
  });
});
