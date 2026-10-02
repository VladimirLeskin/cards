import { describe, expect, it } from "vitest";
import { ParkMatch } from "../src/park/match";
import { applyPark, createParkState, legalPark, recover } from "../src/park/rules";
import type { ParkConfig, ParkState, ParkTileDefinition } from "../src/park/types";

function tile(id: string, kind: ParkTileDefinition["kind"], vp: number, extra: Partial<ParkTileDefinition> = {}): ParkTileDefinition {
  return {
    id,
    name: id,
    text: id,
    image: `${id}.svg`,
    kind,
    vp,
    copies: 4,
    ...extra,
  };
}

function config(tiles: ParkTileDefinition[], combat = 2, move = 3): ParkConfig {
  return {
    id: "test-park",
    title: "Тест",
    description: "Тестовый парк",
    playerCount: { min: 1, max: 4 },
    handLimit: 5,
    openingHand: 2,
    entrance: { name: "Вход", text: "Старт", image: "entrance.svg" },
    tiles,
    diseases: [{ id: "rash", name: "Сыпь", image: "rash.svg", copies: 2 }],
    reactions: [
      { id: "heart", name: "Сердечный приступ", text: "Парк закрывается", image: "heart.svg", effect: "heart", copies: 2 },
      { id: "sneeze", name: "Чихание", text: "Новая болезнь", image: "sneeze.svg", effect: "spawn", copies: 1 },
    ],
    characters: [
      { id: "rick", name: "Рик", image: "rick.svg", move, combat },
      { id: "morty", name: "Морти", image: "morty.svg", move: 1, combat: 0 },
    ],
  };
}

function open(game: ParkConfig, players: { name: string; controller: "human" | "ai"; characterId: string }[], seed = 1): ParkState {
  return createParkState(game, { seed, players });
}

function play(state: ParkState, game: ParkConfig, command: Parameters<typeof applyPark>[2]): ParkState {
  const result = applyPark(state, game, command);
  expect(result.ok, result.error).toBe(true);
  return result.state;
}

function placeAt(state: ParkState, game: ParkConfig, x: number, y: number): ParkState {
  const action = legalPark(state, game, "p1").find(
    (item) => item.command.type === "placeTile" && item.command.x === x && item.command.y === y && !item.command.focusId,
  );
  expect(action).toBeTruthy();
  return play(state, game, action!.command);
}

describe("парк из тайлов", () => {
  const red = tile("lake", "attraction", 2, { color: "red", bonus: { color: "red", vp: 3 } });

  it("даёт очки за тайл и за соседа того же цвета", () => {
    const game = config([red]);
    let state = open(game, [{ name: "Рик", controller: "human", characterId: "rick" }]);
    state = play(state, game, { type: "moveDiseases", playerId: "p1" });
    state = placeAt(state, game, 1, 0);
    expect(state.players.p1?.vp).toBe(2);
    expect(state.phase).toBe("move");

    state = play(state, game, { type: "moveSelf", playerId: "p1", x: 1, y: 0 });
    state = placeAt(state, game, 2, 0);
    expect(state.players.p1?.vp).toBe(7);
    expect(state.ground["2,0"]).toBeTruthy();
  });

  it("не даёт поставить тайл вдали от героя", () => {
    const game = config([red]);
    let state = open(game, [{ name: "Рик", controller: "human", characterId: "rick" }]);
    state = play(state, game, { type: "moveDiseases", playerId: "p1" });
    const hand = state.players.p1!.hand[0]!;
    const before = state.players.p1!.vp;
    const failed = applyPark(state, game, { type: "placeTile", playerId: "p1", instanceId: hand, x: 3, y: 0 });
    expect(failed.ok).toBe(false);
    expect(state.players.p1?.vp).toBe(before);
    expect(state.ground["3,0"]).toBeUndefined();
  });

  it("заставляет сбросить тайл, если на клетке болезнь", () => {
    const game = config([red]);
    const state = open(game, [{ name: "Рик", controller: "human", characterId: "rick" }]);
    state.phase = "start";
    state.startNeed = 1;
    state.diseases = [{ id: "d1", definitionId: "rash", x: 0, y: 0 }];
    expect(legalPark(state, game, "p1").every((action) => action.command.type === "discardTile")).toBe(true);
    expect(applyPark(state, game, { type: "moveDiseases", playerId: "p1" }).ok).toBe(false);
    const next = play(state, game, legalPark(state, game, "p1")[0]!.command);
    expect(next.phase).toBe("move");
    expect(next.players.p1?.hand).toHaveLength(1);
  });

  it("закрывает парк вторым сердечным приступом", () => {
    const game = config([red], 0, 3);
    let state = open(game, [{ name: "Рик", controller: "human", characterId: "rick" }]);
    state = play(state, game, { type: "moveDiseases", playerId: "p1" });
    state = placeAt(state, game, 1, 0);
    state.reactionDeck = ["heart", "heart"];
    state.reactionDiscard = [];
    const shift = legalPark(state, game, "p1").find((action) => action.command.type === "shiftTile");
    expect(shift).toBeTruthy();
    state = play(state, game, shift!.command);
    expect(state.hearts).toBe(1);
    expect(state.status).toBe("playing");
    expect(state.phase).toBe("action");
    state.diseases.push({ id: "d9", definitionId: "rash", x: state.players.p1!.x, y: state.players.p1!.y });
    const shot = legalPark(state, game, "p1").find((action) => action.command.type === "shoot");
    expect(shot).toBeTruthy();
    state = play(state, game, shot!.command);
    expect(state.status).toBe("over");
    expect(state.outcome?.reason).toBe("heart");
  });

  it("выпускает героя только с тайла выхода", () => {
    const game = config([tile("hatch", "exit", 1)]);
    let state = open(game, [{ name: "Рик", controller: "human", characterId: "rick" }]);
    expect(legalPark(state, game, "p1").some((action) => action.command.type === "exitPark")).toBe(false);
    state = play(state, game, { type: "moveDiseases", playerId: "p1" });
    state = placeAt(state, game, 1, 0);
    state = play(state, game, { type: "moveSelf", playerId: "p1", x: 1, y: 0 });
    expect(state.phase).toBe("action");
    state = play(state, game, { type: "exitPark", playerId: "p1" });
    expect(state.players.p1?.exited).toBe(true);
    expect(state.players.p1?.vp).toBe(3);
    expect(state.status).toBe("over");
    expect(state.outcome?.reason).toBe("exits");
  });

  it("не тратит шаг на транзит и тратит на обычный тайл", () => {
    const game = config([tile("canal", "transit", 0), tile("ride", "attraction", 1)], 1, 1);
    const free = lay(game, { "1,0": "canal", "2,0": "canal", "3,0": "ride" });
    const far = legalPark(free, game, "p1").find(
      (action) => action.command.type === "moveSelf" && action.command.x === 3 && action.command.y === 0,
    );
    expect(far).toBeTruthy();

    const paid = lay(game, { "1,0": "ride", "2,0": "ride", "3,0": "ride" });
    expect(
      legalPark(paid, game, "p1").some(
        (action) => action.command.type === "moveSelf" && action.command.x === 3 && action.command.y === 0,
      ),
    ).toBe(false);
    expect(
      legalPark(paid, game, "p1").some(
        (action) => action.command.type === "moveSelf" && action.command.x === 1 && action.command.y === 0,
      ),
    ).toBe(true);
  });

  it("ведёт болезнь на шаг ближе к герою", () => {
    const game = config([red]);
    const state = lay(game, { "1,0": "lake", "2,0": "lake" });
    state.players.p1!.x = 2;
    state.players.p1!.y = 0;
    state.diseases = [{ id: "d1", definitionId: "rash", x: 0, y: 0 }];
    const next = play(state, game, { type: "moveDiseases", playerId: "p1" });
    expect(next.diseases[0]).toMatchObject({ x: 1, y: 0 });
  });

  it("не переставляет вход и транзит", () => {
    const game = config([tile("canal", "transit", 0), red]);
    const state = lay(game, { "1,0": "canal" });
    expect(legalPark(state, game, "p1").some((action) => action.command.type === "shiftTile")).toBe(false);
  });

  it("прячет порядок колоды и чужую руку", () => {
    const game = config([red]);
    const match = ParkMatch.create(game, {
      seed: 2,
      players: [
        { name: "Рик", controller: "human", characterId: "rick" },
        { name: "Морти", controller: "human", characterId: "morty" },
      ],
    });
    const state = match.getState();
    const view = match.view();
    expect(view.hand.map((card) => card.instanceId)).toEqual(state.players.p1?.hand);
    for (const id of state.players.p2?.hand ?? []) expect(view.hand.some((card) => card.instanceId === id)).toBe(false);
    expect(view.players.find((player) => player.id === "p2")?.handCount).toBe(2);
    const blob = JSON.stringify(view);
    for (const id of state.tileDeck) expect(blob).not.toContain(`"${id}"`);
    expect(view.tileDeckCount).toBe(state.tileDeck.length);
  });

  it("заканчивает ход, на котором нечего делать", () => {
    const game = config([tile("gawkers", "focus", 0, { focus: { color: "red", vp: 1 } })]);
    const state = open(game, [{ name: "Рик", controller: "human", characterId: "rick" }]);
    state.tileDeck = [];
    state.tileDiscard = [];
    state.tileRebuilds = 1;
    const stuck = play(state, game, { type: "moveDiseases", playerId: "p1" });
    expect(legalPark(stuck, game, "p1")).toEqual([]);
    const match = ParkMatch.load(game, stuck);
    expect(match.view().status).toBe("over");
    expect(match.getState().outcome?.reason).toBe("tiles");
  });

  it("доигрывает партию компьютера", () => {
    const game = config([red, tile("hatch", "exit", 1), tile("canal", "transit", 0)], 2, 3);
    game.openingHand = 2;
    const match = ParkMatch.create(game, {
      seed: 5,
      players: [
        { name: "Рик", controller: "ai", characterId: "rick" },
        { name: "Морти", controller: "ai", characterId: "morty" },
      ],
    });
    const state = match.getState();
    expect(state.status).toBe("over");
    expect(state.outcome?.winnerIds.length).toBeGreaterThan(0);
    expect(state.log.length).toBeGreaterThan(5);
  });

  it("отклоняет пустое имя и занятого героя", () => {
    const game = config([red]);
    expect(() => open(game, [{ name: "  ", controller: "human", characterId: "rick" }])).toThrow(/имя/);
    expect(() =>
      open(game, [
        { name: "Рик", controller: "human", characterId: "rick" },
        { name: "Ещё Рик", controller: "ai", characterId: "rick" },
      ]),
    ).toThrow(/занят/);
  });
});

function lay(game: ParkConfig, layout: Record<string, string>): ParkState {
  const state = open(game, [{ name: "Рик", controller: "human", characterId: "rick" }]);
  for (const [key, definitionId] of Object.entries(layout)) {
    const instanceId = Object.values(state.pieces).find((piece) => {
      if (piece.definitionId !== definitionId) return false;
      if (Object.values(state.ground).includes(piece.instanceId)) return false;
      if (state.players.p1?.hand.includes(piece.instanceId)) return false;
      return true;
    })?.instanceId;
    expect(instanceId).toBeTruthy();
    state.tileDeck = state.tileDeck.filter((id) => id !== instanceId);
    state.ground[key] = instanceId!;
  }
  return state;
}

describe("recover", () => {
  it("сам по себе закрывает пустое действие", () => {
    const game = config([tile("lake", "attraction", 1)]);
    const state = open(game, [{ name: "Рик", controller: "human", characterId: "rick" }]);
    state.phase = "action";
    state.players.p1!.hand = [];
    state.tileDeck = [];
    state.tileDiscard = [];
    state.tileRebuilds = 1;
    recover(state, game);
    expect(state.status).toBe("over");
    expect(state.outcome?.reason).toBe("tiles");
  });
});
