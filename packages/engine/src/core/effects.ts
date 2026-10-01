import { cardDef } from "./module";
import {
  activePlayer,
  applyDamageToEnemy,
  applyDamageToLocation,
  damagePlayer,
  discardFromZone,
  drawCards,
  emit,
  finishGame,
  gainCard,
  gainPool,
  healPlayer,
  moveCard,
  playerIds,
  pushEffects,
  resetTurnPools,
  tryAddEnemy,
  closeLocation,
} from "./flow";
import { nextInt } from "./rng";
import type { Effect, EffectContext, GameModule, GameState } from "./types";

const RESOLUTION_LIMIT = 5_000;

export function resolveStack(state: GameState, module: GameModule): void {
  let steps = 0;
  while (state.stack.length > 0 && !state.pending && state.status === "playing") {
    steps += 1;
    if (steps > RESOLUTION_LIMIT) {
      finishGame(state, "lost", "resolution-limit");
      return;
    }
    const frame = state.stack[state.stack.length - 1];
    if (!frame) return;
    if (frame.index >= frame.effects.length) {
      state.stack.pop();
      continue;
    }
    const effect = frame.effects[frame.index];
    frame.index += 1;
    if (!effect) continue;
    applyEffect(state, module, effect, frame.context);
  }
}

function ask(
  state: GameState,
  context: EffectContext,
  playerId: string,
  prompt: string,
  options: { id: string; label: string; effects: Effect[] }[],
): void {
  if (options.length === 0 || state.status !== "playing") return;
  if (options.length === 1) {
    pushEffects(state, options[0]!.effects, context);
    return;
  }
  if (state.pending) throw new Error("A decision is already pending");
  state.pending = {
    id: `d${++state.seq}`,
    playerId,
    prompt,
    options: options.map((option) => ({ id: option.id, label: option.label })),
    optionEffects: options.map((option) => option.effects),
    context,
  };
  emit(state, "choice", prompt, { playerId, options: options.map((option) => option.id) });
}

function applyEffect(state: GameState, module: GameModule, effect: Effect, context: EffectContext): void {
  switch (effect.op) {
    case "gain":
      gainPool(state, module, context.controllerId, effect.resource, effect.amount);
      return;
    case "draw":
      drawByTarget(state, module, effect.amount, effect.player ?? "current", context);
      return;
    case "drawPlayer":
      drawCards(state, module, effect.playerId, effect.amount);
      return;
    case "heal":
      healByTarget(state, module, effect.amount, effect.target, context);
      return;
    case "healPlayer":
      healPlayer(state, module, effect.playerId, effect.amount);
      return;
    case "damagePlayer":
      damageByTarget(state, module, effect.amount, effect.target, context);
      return;
    case "damagePlayerDirect":
      damagePlayer(state, module, effect.playerId, effect.amount);
      return;
    case "damageEnemy":
      damageEnemies(state, module, effect.amount, effect.target, context);
      return;
    case "damageEnemyInstance":
      applyDamageToEnemy(state, module, effect.instanceId, effect.amount, context);
      return;
    case "damageLocation":
      applyDamageToLocation(state, module, effect.amount, context);
      return;
    case "addEnemy":
      tryAddEnemy(state, module, context);
      return;
    case "spawnEnemies":
      for (let i = 0; i < effect.amount; i += 1) {
        if (state.status !== "playing") return;
        const location = state.board.locations.active;
        if (!location || state.cards[location]?.resolved) return;
        const added = tryAddEnemy(state, module, context);
        if (!added) return;
      }
      return;
    case "gainCard":
      gainCard(state, module, context.controllerId, effect.definitionId, effect.to);
      return;
    case "discard":
      discardCards(state, module, effect, context);
      return;
    case "discardInstance": {
      const player = state.players[context.controllerId];
      if (!player) return;
      moveCard(player.zones.hand, effect.instanceId, player.zones.discard);
      return;
    }
    case "stun":
      stunByTarget(state, module, effect.target, context);
      return;
    case "stunPlayer":
      forceStun(state, module, effect.playerId);
      return;
    case "gainToken":
      moveToken(state, effect.tokenId, effect.amount, effect.to, context.controllerId);
      return;
    case "custom":
      applyCustom(state, module, effect.id, effect.params ?? {}, context);
      return;
    case "choice":
      ask(state, context, context.controllerId, effect.prompt, effect.options);
      return;
    case "closeLocation":
      closeLocation(state, module, effect.result, context);
      return;
    default: {
      const unknown: never = effect;
      throw new Error(`Unhandled effect ${JSON.stringify(unknown)}`);
    }
  }
}

function drawByTarget(
  state: GameState,
  module: GameModule,
  amount: number,
  target: "current" | "all" | "choice",
  context: EffectContext,
): void {
  if (target === "all") {
    for (const playerId of playerIds(state)) drawCards(state, module, playerId, amount);
    return;
  }
  if (target === "current") {
    drawCards(state, module, context.controllerId, amount);
    return;
  }
  const options = playerIds(state).map((playerId) => ({
    id: playerId,
    label: state.players[playerId]?.name ?? playerId,
    effects: [{ op: "drawPlayer" as const, playerId, amount }],
  }));
  ask(state, context, context.controllerId, "Кто берёт карты?", options);
}

function healByTarget(
  state: GameState,
  module: GameModule,
  amount: number,
  target: "current" | "all" | "choice" | "lowestHealth",
  context: EffectContext,
): void {
  if (target === "all") {
    for (const playerId of playerIds(state)) healPlayer(state, module, playerId, amount);
    return;
  }
  if (target === "current") {
    healPlayer(state, module, context.controllerId, amount);
    return;
  }
  if (target === "lowestHealth") {
    const id = lowestHealthId(state);
    if (id) healPlayer(state, module, id, amount);
    return;
  }
  const options = playerIds(state)
    .filter((playerId) => {
      const player = state.players[playerId];
      return player && !player.stunned && player.health < player.maxHealth;
    })
    .map((playerId) => ({
      id: playerId,
      label: state.players[playerId]?.name ?? playerId,
      effects: [{ op: "healPlayer" as const, playerId, amount }],
    }));
  ask(state, context, context.controllerId, "Кого лечить?", options);
}

function damageByTarget(
  state: GameState,
  module: GameModule,
  amount: number,
  target: "current" | "all" | "choice" | "lowestHealth",
  context: EffectContext,
): void {
  if (target === "all") {
    for (const playerId of playerIds(state)) damagePlayer(state, module, playerId, amount);
    return;
  }
  if (target === "current") {
    damagePlayer(state, module, context.controllerId, amount);
    return;
  }
  if (target === "lowestHealth") {
    const id = lowestHealthId(state);
    if (id) damagePlayer(state, module, id, amount);
    return;
  }
  const options = playerIds(state).map((playerId) => ({
    id: playerId,
    label: state.players[playerId]?.name ?? playerId,
    effects: [{ op: "damagePlayerDirect" as const, playerId, amount }],
  }));
  ask(state, context, context.controllerId, "Кого ранить?", options);
}

function damageEnemies(
  state: GameState,
  module: GameModule,
  amount: number,
  target: "all" | "choice" | "lowestHealth",
  context: EffectContext,
): void {
  const active = [...state.board.enemies.active];
  if (active.length === 0) return;
  if (target === "all") {
    for (const instanceId of active) applyDamageToEnemy(state, module, instanceId, amount, context);
    return;
  }
  if (target === "lowestHealth") {
    const instanceId = [...active].sort(
      (a, b) =>
        (state.cards[a] ? (cardDef(module, state.cards[a]!.definitionId).health ?? 0) - state.cards[a]!.damage : 0) -
        (state.cards[b] ? (cardDef(module, state.cards[b]!.definitionId).health ?? 0) - state.cards[b]!.damage : 0),
    )[0];
    if (instanceId) applyDamageToEnemy(state, module, instanceId, amount, context);
    return;
  }
  const options = active.map((instanceId) => {
    const def = cardDef(module, state.cards[instanceId]!.definitionId);
    return {
      id: instanceId,
      label: def.name,
      effects: [{ op: "damageEnemyInstance" as const, instanceId, amount }],
    };
  });
  ask(state, context, context.controllerId, "Кого атаковать?", options);
}

function discardCards(
  state: GameState,
  module: GameModule,
  effect: Extract<Effect, { op: "discard" }>,
  context: EffectContext,
): void {
  const player = state.players[context.controllerId];
  if (!player) return;
  if (player.zones.hand.length === 0) {
    if (effect.orElse) pushEffects(state, effect.orElse, context);
    return;
  }
  const mode = effect.mode ?? "random";
  if (mode === "choice") {
    const options = player.zones.hand.map((instanceId) => {
      const def = cardDef(module, state.cards[instanceId]!.definitionId);
      const followup: Effect[] = [{ op: "discardInstance", instanceId }];
      if (effect.amount > 1) {
        followup.push({
          op: "discard",
          amount: effect.amount - 1,
          player: "current",
          mode: "choice",
          ...(effect.orElse ? { orElse: effect.orElse } : {}),
        });
      }
      return { id: instanceId, label: def.name, effects: followup };
    });
    ask(state, context, player.id, "Сбросьте карту", options);
    return;
  }
  let failed = false;
  for (let i = 0; i < effect.amount; i += 1) {
    if (player.zones.hand.length === 0) {
      failed = true;
      break;
    }
    const roll = nextInt(state.rng, player.zones.hand.length);
    state.rng = roll.state;
    const instanceId = player.zones.hand[roll.value];
    if (!instanceId) break;
    moveCard(player.zones.hand, instanceId, player.zones.discard);
  }
  if (failed && effect.orElse) pushEffects(state, effect.orElse, context);
}

function forceStun(state: GameState, module: GameModule, playerId: string): void {
  const player = state.players[playerId];
  if (!player || player.stunned || state.status !== "playing") return;
  player.health = 0;
  player.stunned = true;
  discardFromZone(player, "hand");
  discardFromZone(player, "play");
  resetTurnPools(state, module, player);
  emit(state, "stun", `${player.name} оглушён`, { playerId });
  if (
    module.config.mechanics.loseIfAllStunned &&
    playerIds(state).every((id) => state.players[id]?.stunned)
  ) {
    finishGame(state, "lost", "all-stunned");
  }
}

function stunByTarget(
  state: GameState,
  module: GameModule,
  target: "current" | "all" | "choice" | "lowestHealth",
  context: EffectContext,
): void {
  if (target === "all") {
    for (const playerId of playerIds(state)) forceStun(state, module, playerId);
    return;
  }
  if (target === "current") {
    forceStun(state, module, context.controllerId);
    return;
  }
  if (target === "lowestHealth") {
    const id = lowestHealthId(state);
    if (id) forceStun(state, module, id);
    return;
  }
  ask(
    state,
    context,
    context.controllerId,
    "Кого оглушить?",
    playerIds(state).map((playerId) => ({
      id: `stun-${playerId}`,
      label: state.players[playerId]?.name ?? playerId,
      effects: [{ op: "stunPlayer", playerId }],
    })),
  );
}

function moveToken(
  state: GameState,
  tokenId: string,
  amount: number,
  to: "current" | "supply",
  playerId: string,
): void {
  const token = state.items.tokens[tokenId];
  if (!token || amount <= 0) return;
  if (to === "supply") {
    const holder = token.holders[playerId] ?? 0;
    const moved = Math.min(holder, amount);
    token.holders[playerId] = holder - moved;
    token.supply += moved;
    return;
  }
  const moved = Math.min(token.supply, amount);
  token.supply -= moved;
  token.holders[playerId] = (token.holders[playerId] ?? 0) + moved;
  if (moved > 0) {
    emit(state, "token", `Жетон получен: ${moved}`, { tokenId, playerId, amount: moved });
  }
}

function applyCustom(
  state: GameState,
  module: GameModule,
  id: string,
  params: Record<string, string | number | boolean>,
  context: EffectContext,
): void {
  const handler = module.handlers[id];
  if (!handler) throw new Error(`No handler registered for effect "${id}"`);
  handler({
    state,
    module,
    context,
    params,
    emit: (type, message, payload) => emit(state, type, message, payload),
    push: (effects) => pushEffects(state, effects, context),
  });
}

function lowestHealthId(state: GameState): string | undefined {
  let best: string | undefined;
  let bestHealth = Infinity;
  for (const playerId of playerIds(state)) {
    const player = state.players[playerId];
    if (!player || player.stunned) continue;
    if (player.health < bestHealth) {
      best = playerId;
      bestHealth = player.health;
    }
  }
  return best ?? activePlayer(state).id;
}
