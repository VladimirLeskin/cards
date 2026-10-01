import { resolveStack } from "./effects";
import {
  activePlayer,
  createCard,
  drawCards,
  effectsFor,
  emit,
  pushEffects,
  refillMarket,
} from "./flow";
import { cardDef, heroDef } from "./module";
import { rngFromSeed, shuffleInPlace } from "./rng";
import type { CreateMatchOptions, GameModule, GameState, PlayerSetup } from "./types";

export class SetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SetupError";
  }
}

export function createInitialState(module: GameModule, options: CreateMatchOptions, seed: number): GameState {
  const { config } = module;
  if (options.players.length < config.playerCount.min || options.players.length > config.playerCount.max) {
    throw new SetupError(
      `Игре «${config.title}» нужно от ${config.playerCount.min} до ${config.playerCount.max} игроков`,
    );
  }

  const state: GameState = {
    matchId: `${config.id}-${seed}`,
    configId: config.id,
    seed,
    rng: rngFromSeed(seed),
    seq: 0,
    status: "playing",
    turn: 1,
    activePlayerIndex: 0,
    turnOrder: [],
    phase: { id: "threat", step: "begin", cursor: 0, queue: [] },
    players: {},
    board: {
      market: { deck: [], row: Array.from({ length: config.mechanics.marketSize }, () => null) },
      enemies: { deck: [], active: [], discard: [] },
      locations: { deck: [], active: null, completed: [], lost: [] },
      events: { deck: [], discard: [], revealed: [] },
      banished: [],
    },
    cards: {},
    items: { dice: [], tokens: {}, props: [] },
    stack: [],
    pending: null,
    log: [],
  };

  const usedHeroes = new Set<string>();
  options.players.forEach((setup, index) => {
    const playerId = `p${index + 1}`;
    state.turnOrder.push(playerId);
    state.players[playerId] = createPlayer(module, playerId, index, setup, usedHeroes);
  });

  state.board.market.deck = instantiate(state, config.piles.market);
  state.rng = shuffleInPlace(state.board.market.deck, state.rng);
  state.board.enemies.deck = instantiate(state, config.piles.enemies);
  state.rng = shuffleInPlace(state.board.enemies.deck, state.rng);
  state.board.events.deck = instantiate(state, config.piles.events);
  state.rng = shuffleInPlace(state.board.events.deck, state.rng);
  state.board.locations.deck = instantiate(state, config.piles.locations);

  for (const die of config.dice) state.items.dice.push({ id: die.id, available: true });
  for (const token of config.tokens) {
    const holders: Record<string, number> = {};
    for (const playerId of state.turnOrder) holders[playerId] = token.eachPlayer;
    state.items.tokens[token.id] = { supply: token.supply, holders };
  }
  for (const prop of config.props) state.items.props.push({ id: prop.id, usesThisTurn: 0 });

  for (const playerId of state.turnOrder) {
    const player = state.players[playerId];
    if (!player) continue;
    const hero = heroDef(module, player.heroId);
    const deck: string[] = [];
    for (const entry of hero.startingDeck) {
      for (let i = 0; i < entry.count; i += 1) deck.push(createCard(state, entry.definitionId, playerId));
    }
    player.zones.deck = deck;
    state.rng = shuffleInPlace(player.zones.deck, state.rng);
    drawCards(state, module, playerId, config.mechanics.handSize);
  }

  refillMarket(state);
  const first = state.board.locations.deck.shift();
  if (!first) throw new SetupError("В конфиге нет локаций");
  state.board.locations.active = first;
  const def = cardDef(module, state.cards[first]!.definitionId);
  emit(state, "start", `Партия «${config.title}» началась`, { matchId: state.matchId, seed });
  emit(state, "location", `Открыта локация: ${def.name}`, { instanceId: first, definitionId: def.id });
  pushEffects(
    state,
    [...effectsFor(def, "onEnter"), { op: "spawnEnemies", amount: def.enemyCount ?? 0 }],
    { controllerId: activePlayer(state).id, sourceInstanceId: first, trigger: "onEnter" },
  );
  resolveStack(state, module);
  emit(state, "turn", `Ход ${state.turn}: ${activePlayer(state).name}`, {
    turn: state.turn,
    playerId: activePlayer(state).id,
  });
  return state;
}

function instantiate(state: GameState, definitionIds: string[]): string[] {
  return definitionIds.map((definitionId) => createCard(state, definitionId, null));
}

function createPlayer(
  module: GameModule,
  playerId: string,
  seat: number,
  setup: PlayerSetup,
  usedHeroes: Set<string>,
) {
  const { config } = module;
  const heroId = setup.heroId ?? config.heroes[seat]?.id;
  if (!heroId || !module.heroes.has(heroId)) throw new SetupError(`Неизвестный герой: ${heroId ?? "(пусто)"}`);
  if (usedHeroes.has(heroId)) throw new SetupError(`Герой уже занят: ${heroId}`);
  usedHeroes.add(heroId);
  const side = setup.side ?? "party";
  if (config.mode === "cooperative" && side !== "party") {
    throw new SetupError("В кооперативной игре все игроки на одной стороне");
  }
  const hero = heroDef(module, heroId);
  const pools: Record<string, number> = {};
  for (const resource of config.resources) pools[resource.id] = 0;
  if (!setup.name.trim()) throw new SetupError("У игрока должно быть имя");
  return {
    id: playerId,
    seat,
    name: setup.name.trim(),
    controller: setup.controller,
    side,
    aiProfile: setup.aiProfile ?? "ally",
    heroId,
    health: hero.health,
    maxHealth: hero.health,
    stunned: false,
    pools,
    zones: { deck: [], hand: [], discard: [], play: [] },
    abilityUsedThisTurn: false,
    oncePerGameUsed: false,
  };
}
