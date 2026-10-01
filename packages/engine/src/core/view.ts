import { actorId, legalActions } from "./legal";
import { cardDef, heroDef } from "./module";
import type { CardView, ClientView, GameModule, GameState, HandView, PlayerView } from "./types";

export function projectView(state: GameState, module: GameModule, viewerId?: string): ClientView {
  const actor = actorId(state);
  const actions = actor ? legalActions(state, module, actor) : [];
  const visibleActions = !viewerId || viewerId === actor ? actions : [];
  return {
    matchId: state.matchId,
    configId: state.configId,
    title: module.config.title,
    mode: module.config.mode,
    art: module.config.art,
    resources: module.config.resources,
    status: state.status,
    ...(state.outcome ? { outcome: state.outcome } : {}),
    turn: state.turn,
    phase: state.phase,
    activePlayerId: state.turnOrder[state.activePlayerIndex] ?? "",
    ...(viewerId ? { viewerId } : {}),
    players: state.turnOrder.map((playerId) => projectPlayer(state, module, playerId, viewerId)),
    market: state.board.market.row.map((instanceId) => (instanceId ? projectCard(state, module, instanceId) : null)),
    marketDeckCount: state.board.market.deck.length,
    enemies: state.board.enemies.active.map((instanceId) => projectCard(state, module, instanceId)),
    enemyDeckCount: state.board.enemies.deck.length,
    location: state.board.locations.active ? projectCard(state, module, state.board.locations.active) : null,
    locationsRemaining: state.board.locations.deck.length,
    eventsRevealed: state.board.events.revealed.map((instanceId) => projectCard(state, module, instanceId)),
    eventDeckCount: state.board.events.deck.length,
    dice: state.items.dice.map((die) => {
      const def = module.config.dice.find((item) => item.id === die.id);
      return {
        id: die.id,
        name: def?.name ?? die.id,
        image: def?.image ?? "",
        available: die.available,
        ...(die.lastFaceId ? { lastFaceId: die.lastFaceId } : {}),
      };
    }),
    props: state.items.props.map((prop) => {
      const def = module.config.props.find((item) => item.id === prop.id);
      const available = def?.usage === "unlimited" || prop.usesThisTurn === 0;
      return {
        id: prop.id,
        name: def?.name ?? prop.id,
        image: def?.image ?? "",
        description: def?.description ?? "",
        available,
      };
    }),
    tokens: module.config.tokens.map((token) => ({
      id: token.id,
      name: token.name,
      image: token.image,
      supply: state.items.tokens[token.id]?.supply ?? 0,
    })),
    pending: state.pending
      ? {
          id: state.pending.id,
          playerId: state.pending.playerId,
          prompt: state.pending.prompt,
          options: state.pending.options,
        }
      : null,
    log: state.log,
    legalActions: visibleActions,
  };
}

function projectPlayer(state: GameState, module: GameModule, playerId: string, viewerId?: string): PlayerView {
  const player = state.players[playerId];
  if (!player) throw new Error(`Missing player ${playerId}`);
  const hero = heroDef(module, player.heroId);
  const open = module.config.mechanics.handVisibility === "open" || !viewerId || viewerId === playerId;
  const hand: HandView = open
    ? player.zones.hand.map((instanceId) => projectCard(state, module, instanceId))
    : { hidden: true, count: player.zones.hand.length };
  const abilityAvailable =
    state.status === "playing" &&
    state.phase.id === "action" &&
    !state.pending &&
    !player.stunned &&
    state.turnOrder[state.activePlayerIndex] === playerId &&
    (hero.ability.usage === "oncePerTurn"
      ? !player.abilityUsedThisTurn
      : hero.ability.usage === "oncePerGame"
        ? !player.oncePerGameUsed
        : false);
  const tokens: Record<string, number> = {};
  for (const [tokenId, token] of Object.entries(state.items.tokens)) {
    tokens[tokenId] = token.holders[playerId] ?? 0;
  }
  return {
    id: player.id,
    seat: player.seat,
    name: player.name,
    controller: player.controller,
    side: player.side,
    heroId: player.heroId,
    heroName: hero.name,
    heroImage: hero.image,
    abilityName: hero.ability.name,
    abilityText: hero.ability.text,
    abilityAvailable,
    health: player.health,
    maxHealth: player.maxHealth,
    stunned: player.stunned,
    pools: { ...player.pools },
    hand,
    deckCount: player.zones.deck.length,
    discard: player.zones.discard.map((instanceId) => projectCard(state, module, instanceId)),
    play: player.zones.play.map((instanceId) => projectCard(state, module, instanceId)),
    tokens,
  };
}

export function projectCard(state: GameState, module: GameModule, instanceId: string): CardView {
  const instance = state.cards[instanceId];
  if (!instance) throw new Error(`Missing card ${instanceId}`);
  const def = cardDef(module, instance.definitionId);
  const remaining = def.health != null ? Math.max(0, def.health - instance.damage) : undefined;
  return {
    instanceId,
    definitionId: def.id,
    name: def.name,
    kind: def.kind,
    text: def.text,
    image: def.image,
    tags: def.tags,
    ...(def.cost != null ? { cost: def.cost } : {}),
    ...(def.health != null ? { health: def.health } : {}),
    damage: instance.damage,
    ...(remaining != null ? { remainingHealth: remaining } : {}),
    ...(def.attack != null ? { attack: def.attack } : {}),
    ...(def.stays ? { stays: true } : {}),
    ...(def.provides ? { provides: def.provides } : {}),
  };
}
