import { activePlayerId, cardDef, resourceByRole } from "./module";
import { shuffleInPlace } from "./rng";
import type {
  CardDefinition,
  Effect,
  EffectContext,
  GameModule,
  GameState,
  PlayerState,
  Trigger,
} from "./types";

export function emit(
  state: GameState,
  type: string,
  message: string,
  payload: Record<string, unknown> = {},
): void {
  state.log.push({ id: ++state.seq, type, message, payload });
}

export function finishGame(state: GameState, result: "won" | "lost", reason: string): void {
  if (state.status !== "playing") return;
  state.status = result;
  state.outcome = { result, reason };
  state.stack = [];
  state.pending = null;
  emit(
    state,
    "gameOver",
    result === "won" ? "Партия выиграна" : "Партия проиграна",
    { result, reason },
  );
}

export function activePlayer(state: GameState): PlayerState {
  const id = activePlayerId(state);
  const player = state.players[id];
  if (!player) throw new Error(`Missing player ${id}`);
  return player;
}

export function effectsFor(def: CardDefinition, trigger: Trigger): Effect[] {
  const effects: Effect[] = [];
  for (const block of def.effects ?? []) {
    if (block.trigger === trigger) effects.push(...block.effects);
  }
  return effects;
}

export function pushEffects(state: GameState, effects: Effect[], context: EffectContext): void {
  if (effects.length === 0) return;
  state.stack.push({ effects, index: 0, context });
}

export function createCard(state: GameState, definitionId: string, ownerId: string | null): string {
  const instanceId = `c${++state.seq}`;
  state.cards[instanceId] = {
    instanceId,
    definitionId,
    damage: 0,
    resolved: false,
    ownerId,
  };
  return instanceId;
}

export function remainingHealth(state: GameState, module: GameModule, instanceId: string): number {
  const instance = state.cards[instanceId];
  if (!instance) return 0;
  const def = cardDef(module, instance.definitionId);
  return Math.max(0, (def.health ?? 0) - instance.damage);
}

export function gainPool(
  state: GameState,
  module: GameModule,
  playerId: string,
  resourceId: string,
  amount: number,
): void {
  if (amount === 0) return;
  const def = module.config.resources.find((resource) => resource.id === resourceId);
  if (!def) throw new Error(`Unknown resource ${resourceId}`);
  const player = state.players[playerId];
  if (!player) throw new Error(`Missing player ${playerId}`);
  const next = (player.pools[resourceId] ?? 0) + amount;
  const capped = def.max != null ? Math.min(def.max, next) : next;
  player.pools[resourceId] = Math.max(def.min, capped);
}

export function resetTurnPools(_state: GameState, module: GameModule, player: PlayerState): void {
  for (const resource of module.config.resources) {
    if (resource.persistence === "turn") player.pools[resource.id] = 0;
  }
}

function recycle(state: GameState, source: string[], deck: string[]): void {
  for (const id of source) {
    const card = state.cards[id];
    if (!card) continue;
    card.damage = 0;
    card.resolved = false;
  }
  state.rng = shuffleInPlace(source, state.rng);
  while (source.length > 0) {
    const id = source.pop();
    if (id) deck.push(id);
  }
}

export function drawCards(state: GameState, _module: GameModule, playerId: string, amount: number): number {
  const player = state.players[playerId];
  if (!player || amount <= 0) return 0;
  let drawn = 0;
  for (let i = 0; i < amount; i += 1) {
    if (player.zones.deck.length === 0) {
      if (player.zones.discard.length === 0) break;
      recycle(state, player.zones.discard, player.zones.deck);
    }
    const id = player.zones.deck.pop();
    if (!id) break;
    player.zones.hand.push(id);
    drawn += 1;
  }
  if (drawn > 0) {
    emit(state, "draw", `${player.name} берёт карты: ${drawn}`, { playerId, amount: drawn });
  }
  return drawn;
}

export function discardFromZone(player: PlayerState, zone: "hand" | "play"): void {
  while (player.zones[zone].length > 0) {
    const id = player.zones[zone].pop();
    if (id) player.zones.discard.push(id);
  }
}

export function moveCard(from: string[], instanceId: string, to: string[]): boolean {
  const index = from.indexOf(instanceId);
  if (index < 0) return false;
  from.splice(index, 1);
  to.push(instanceId);
  return true;
}

export function enemySlotCap(state: GameState, module: GameModule): number {
  const locationId = state.board.locations.active;
  if (!locationId) return module.config.mechanics.enemySlots;
  const def = cardDef(module, state.cards[locationId]!.definitionId);
  return def.maxEnemies ?? module.config.mechanics.enemySlots;
}

export function eventsThisTurn(state: GameState, module: GameModule): number {
  const { eventsPerTurn } = module.config.mechanics;
  if (eventsPerTurn !== "location") return eventsPerTurn;
  const locationId = state.board.locations.active;
  if (!locationId) return 0;
  return cardDef(module, state.cards[locationId]!.definitionId).eventCount ?? 0;
}

export function refillMarket(state: GameState): void {
  const { row, deck } = state.board.market;
  for (let i = 0; i < row.length; i += 1) {
    if (row[i]) continue;
    const next = deck.pop();
    if (!next) break;
    row[i] = next;
  }
}

export function damagePlayer(
  state: GameState,
  module: GameModule,
  playerId: string,
  amount: number,
): void {
  if (amount <= 0 || state.status !== "playing") return;
  const player = state.players[playerId];
  if (!player || player.stunned) return;
  player.health = Math.max(0, player.health - amount);
  emit(state, "damage", `${player.name} получает ${amount} урона`, { playerId, amount, health: player.health });
  if (player.health === 0 && module.config.mechanics.stunOnZeroHealth) {
    player.stunned = true;
    discardFromZone(player, "hand");
    discardFromZone(player, "play");
    resetTurnPools(state, module, player);
    emit(state, "stun", `${player.name} оглушён`, { playerId });
  }
  if (
    module.config.mechanics.loseIfAllStunned &&
    state.turnOrder.every((id) => state.players[id]?.stunned)
  ) {
    finishGame(state, "lost", "all-stunned");
  }
}

export function healPlayer(
  state: GameState,
  _module: GameModule,
  playerId: string,
  amount: number,
): void {
  if (amount <= 0 || state.status !== "playing") return;
  const player = state.players[playerId];
  if (!player || player.stunned) return;
  const before = player.health;
  player.health = Math.min(player.maxHealth, player.health + amount);
  const gained = player.health - before;
  if (gained > 0) {
    emit(state, "heal", `${player.name} восстанавливает ${gained} здоровья`, {
      playerId,
      amount: gained,
      health: player.health,
    });
  }
}

export function queueEnemyDefeat(
  state: GameState,
  module: GameModule,
  instanceId: string,
  context: EffectContext,
): void {
  const instance = state.cards[instanceId];
  if (!instance || instance.resolved || state.status !== "playing") return;
  instance.resolved = true;
  const index = state.board.enemies.active.indexOf(instanceId);
  if (index >= 0) state.board.enemies.active.splice(index, 1);
  state.board.enemies.discard.push(instanceId);
  const def = cardDef(module, instance.definitionId);
  emit(state, "defeat", `${def.name} побеждён`, { instanceId, definitionId: def.id });
  const followup: Effect[] = [...effectsFor(def, "onDefeat"), ...(def.reward ?? [])];
  if (module.config.mechanics.enemyRefill === "onDefeat") {
    followup.push({ op: "addEnemy" });
  }
  pushEffects(state, followup, { ...context, sourceInstanceId: instanceId, trigger: "onDefeat" });
}

export function queueLocationClose(
  state: GameState,
  module: GameModule,
  result: "completed" | "lost",
  context: EffectContext,
): void {
  const locationId = state.board.locations.active;
  if (!locationId || state.status !== "playing") return;
  const instance = state.cards[locationId];
  if (!instance || instance.resolved) return;
  instance.resolved = true;
  const def = cardDef(module, instance.definitionId);
  const followup: Effect[] = [];
  if (result === "completed") {
    followup.push(...(def.reward ?? []), ...effectsFor(def, "onDefeat"));
  }
  followup.push({ op: "closeLocation", result });
  pushEffects(state, followup, { ...context, sourceInstanceId: locationId, trigger: "onDefeat" });
}

export function applyDamageToEnemy(
  state: GameState,
  module: GameModule,
  instanceId: string,
  amount: number,
  context: EffectContext,
): void {
  if (amount <= 0 || state.status !== "playing") return;
  if (!state.board.enemies.active.includes(instanceId)) return;
  const instance = state.cards[instanceId];
  if (!instance || instance.resolved) return;
  const def = cardDef(module, instance.definitionId);
  instance.damage += amount;
  emit(state, "strike", `${def.name} получает ${amount} урона`, {
    instanceId,
    amount,
    damage: instance.damage,
  });
  if ((def.health ?? 0) > 0 && instance.damage >= (def.health ?? 0)) {
    queueEnemyDefeat(state, module, instanceId, context);
  }
}

export function applyDamageToLocation(
  state: GameState,
  module: GameModule,
  amount: number,
  context: EffectContext,
): void {
  if (amount <= 0 || state.status !== "playing") return;
  const locationId = state.board.locations.active;
  if (!locationId) return;
  const instance = state.cards[locationId];
  if (!instance || instance.resolved) return;
  const def = cardDef(module, instance.definitionId);
  instance.damage += amount;
  emit(state, "strike", `${def.name}: урон ${amount}`, {
    instanceId: locationId,
    amount,
    damage: instance.damage,
  });
  if ((def.health ?? 0) > 0 && instance.damage >= (def.health ?? 0)) {
    queueLocationClose(state, module, "completed", context);
  }
}

export function pullEnemy(state: GameState, module: GameModule): string | null {
  if (state.board.enemies.deck.length === 0 && module.config.mechanics.emptyEnemyDeck === "reshuffle") {
    if (state.board.enemies.discard.length === 0) return null;
    recycle(state, state.board.enemies.discard, state.board.enemies.deck);
  }
  return state.board.enemies.deck.pop() ?? null;
}

export function tryAddEnemy(state: GameState, module: GameModule, context: EffectContext): boolean {
  if (state.status !== "playing") return false;
  const locationId = state.board.locations.active;
  if (!locationId) return false;
  const location = state.cards[locationId];
  if (!location || location.resolved) return false;
  if (state.board.enemies.active.length >= enemySlotCap(state, module)) {
    queueLocationClose(state, module, "lost", context);
    return false;
  }
  const instanceId = pullEnemy(state, module);
  if (!instanceId) return false;
  const instance = state.cards[instanceId];
  if (instance) {
    instance.damage = 0;
    instance.resolved = false;
  }
  state.board.enemies.active.push(instanceId);
  const def = cardDef(module, state.cards[instanceId]!.definitionId);
  emit(state, "enemy", `На поле выходит ${def.name}`, { instanceId, definitionId: def.id });
  pushEffects(state, effectsFor(def, "onEnter"), {
    ...context,
    sourceInstanceId: instanceId,
    trigger: "onEnter",
  });
  return true;
}

export function closeLocation(
  state: GameState,
  module: GameModule,
  result: "completed" | "lost",
  context: EffectContext,
): void {
  const locationId = state.board.locations.active;
  if (!locationId) return;
  const def = cardDef(module, state.cards[locationId]!.definitionId);
  state.board.locations.active = null;
  if (result === "completed") {
    state.board.locations.completed.push(locationId);
    emit(state, "location", `Локация пройдена: ${def.name}`, { instanceId: locationId, result });
  } else {
    state.board.locations.lost.push(locationId);
    emit(state, "location", `Локация захвачена: ${def.name}`, { instanceId: locationId, result });
  }
  while (state.board.enemies.active.length > 0) {
    const enemyId = state.board.enemies.active.pop();
    if (!enemyId) break;
    const enemy = state.cards[enemyId];
    if (enemy) {
      enemy.damage = 0;
      enemy.resolved = false;
    }
    state.board.enemies.discard.push(enemyId);
  }
  const next = state.board.locations.deck.shift();
  if (!next) {
    finishGame(state, result === "completed" ? "won" : "lost", result === "completed" ? "all-locations-cleared" : "locations-overrun");
    return;
  }
  state.board.locations.active = next;
  const nextDef = cardDef(module, state.cards[next]!.definitionId);
  emit(state, "location", `Открыта локация: ${nextDef.name}`, { instanceId: next, definitionId: nextDef.id });
  pushEffects(
    state,
    [...effectsFor(nextDef, "onEnter"), { op: "spawnEnemies", amount: nextDef.enemyCount ?? 0 }],
    { ...context, sourceInstanceId: next, trigger: "onEnter" },
  );
}

export function revealEvents(state: GameState, module: GameModule): void {
  const count = eventsThisTurn(state, module);
  for (let i = 0; i < count; i += 1) {
    if (state.status !== "playing") return;
    if (state.board.events.deck.length === 0) {
      const policy = module.config.mechanics.emptyEventDeck;
      if (policy === "lose") {
        finishGame(state, "lost", "event-deck-empty");
        return;
      }
      if (policy === "reshuffle" && state.board.events.discard.length > 0) {
        recycle(state, state.board.events.discard, state.board.events.deck);
      }
      if (state.board.events.deck.length === 0) return;
    }
    const instanceId = state.board.events.deck.pop();
    if (!instanceId) return;
    state.board.events.revealed.push(instanceId);
    const def = cardDef(module, state.cards[instanceId]!.definitionId);
    emit(state, "event", `Событие: ${def.name}`, { instanceId, definitionId: def.id });
  }
}

export function gainCard(
  state: GameState,
  module: GameModule,
  playerId: string,
  definitionId: string,
  to: "discard" | "hand" | "deckTop",
): void {
  cardDef(module, definitionId);
  const player = state.players[playerId];
  if (!player) return;
  const instanceId = createCard(state, definitionId, playerId);
  if (to === "hand") player.zones.hand.push(instanceId);
  else if (to === "deckTop") player.zones.deck.push(instanceId);
  else player.zones.discard.push(instanceId);
  const def = cardDef(module, definitionId);
  emit(state, "gainCard", `${player.name} получает «${def.name}»`, { playerId, instanceId, definitionId, to });
}

export function playerIds(state: GameState): string[] {
  return state.turnOrder.filter((id) => state.players[id]);
}

export function attackResourceId(module: GameModule): string | undefined {
  return resourceByRole(module, "attack")?.id;
}

export function currencyResourceId(module: GameModule): string | undefined {
  return resourceByRole(module, "currency")?.id;
}

export function healResourceId(module: GameModule): string | undefined {
  return resourceByRole(module, "heal")?.id;
}
