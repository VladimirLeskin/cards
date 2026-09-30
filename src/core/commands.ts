import { cardDef, heroDef, resourceByRole } from "./module";
import { resolveStack } from "./effects";
import {
  activePlayer,
  applyDamageToEnemy,
  applyDamageToLocation,
  emit,
  gainPool,
  healPlayer,
  pushEffects,
} from "./flow";
import { nextInt } from "./rng";
import type { EffectContext, GameModule, GameState } from "./types";
import type { Command } from "./types";

export function executeCommand(state: GameState, module: GameModule, command: Command): void {
  switch (command.type) {
    case "playCard":
      playCard(state, module, command.playerId, command.instanceId);
      return;
    case "buyCard":
      buyCard(state, module, command.playerId, command.instanceId);
      return;
    case "assignAttack":
      assignAttack(state, module, command.playerId, command.target, command.amount);
      return;
    case "assignHeal":
      assignHeal(state, module, command.playerId, command.targetPlayerId, command.amount);
      return;
    case "activateAbility":
      activateAbility(state, module, command.playerId);
      return;
    case "rollDie":
      rollDie(state, module, command.playerId, command.dieId);
      return;
    case "spendToken":
      spendToken(state, module, command.playerId, command.tokenId);
      return;
    case "useProp":
      useProp(state, module, command.playerId, command.propId);
      return;
    case "endTurn":
      state.phase = { id: "cleanup", step: "begin", cursor: 0, queue: [] };
      emit(state, "endTurn", `${state.players[command.playerId]?.name ?? "Игрок"} заканчивает ход`, {
        playerId: command.playerId,
      });
      return;
    case "choose":
      choose(state, command.optionId);
      return;
    default: {
      const unknown: never = command;
      throw new Error(`Unhandled command ${JSON.stringify(unknown)}`);
    }
  }
}

function contextFor(_state: GameState, playerId: string, sourceInstanceId: string | undefined, trigger: string): EffectContext {
  return { controllerId: playerId, ...(sourceInstanceId ? { sourceInstanceId } : {}), trigger };
}

function playCard(state: GameState, module: GameModule, playerId: string, instanceId: string): void {
  const player = state.players[playerId] ?? activePlayer(state);
  const index = player.zones.hand.indexOf(instanceId);
  if (index < 0) return;
  player.zones.hand.splice(index, 1);
  player.zones.play.push(instanceId);
  const instance = state.cards[instanceId];
  if (instance) instance.ownerId = playerId;
  const def = cardDef(module, instance!.definitionId);
  emit(state, "play", `${player.name} играет «${def.name}»`, { playerId, instanceId, definitionId: def.id });
  for (const gain of def.provides ?? []) {
    gainPool(state, module, playerId, gain.resource, gain.amount);
  }
  const blocks = def.effects?.filter((block) => block.trigger === "onPlay").flatMap((block) => block.effects) ?? [];
  pushEffects(state, blocks, contextFor(state, playerId, instanceId, "onPlay"));
}

function buyCard(state: GameState, module: GameModule, playerId: string, instanceId: string): void {
  const player = state.players[playerId];
  if (!player) return;
  const currency = resourceByRole(module, "currency");
  if (!currency) return;
  const slot = state.board.market.row.indexOf(instanceId);
  if (slot < 0) return;
  const def = cardDef(module, state.cards[instanceId]!.definitionId);
  const cost = def.cost ?? 0;
  player.pools[currency.id] = (player.pools[currency.id] ?? 0) - cost;
  state.board.market.row[slot] = null;
  const destination = module.config.mechanics.buyDestination;
  if (destination === "hand") player.zones.hand.push(instanceId);
  else player.zones.discard.push(instanceId);
  const instance = state.cards[instanceId];
  if (instance) instance.ownerId = playerId;
  emit(state, "buy", `${player.name} покупает «${def.name}»`, { playerId, instanceId, definitionId: def.id, cost });
  const acquired = def.effects?.filter((block) => block.trigger === "onAcquire").flatMap((block) => block.effects) ?? [];
  pushEffects(state, acquired, contextFor(state, playerId, instanceId, "onAcquire"));
  const row = state.board.market.row;
  if (!row[slot]) {
    const next = state.board.market.deck.pop();
    if (next) row[slot] = next;
  }
}

function assignAttack(
  state: GameState,
  module: GameModule,
  playerId: string,
  target: { type: "enemy"; instanceId: string } | { type: "location" },
  amount: number,
): void {
  const attack = resourceByRole(module, "attack");
  const player = state.players[playerId];
  if (!attack || !player || amount <= 0) return;
  player.pools[attack.id] = (player.pools[attack.id] ?? 0) - amount;
  const context = contextFor(state, playerId, undefined, "assignAttack");
  if (target.type === "enemy") applyDamageToEnemy(state, module, target.instanceId, amount, context);
  else applyDamageToLocation(state, module, amount, context);
}

function assignHeal(
  state: GameState,
  module: GameModule,
  playerId: string,
  targetPlayerId: string,
  amount: number,
): void {
  const heal = resourceByRole(module, "heal");
  const player = state.players[playerId];
  if (!heal || !player || amount <= 0) return;
  player.pools[heal.id] = (player.pools[heal.id] ?? 0) - amount;
  healPlayer(state, module, targetPlayerId, amount);
}

function activateAbility(state: GameState, module: GameModule, playerId: string): void {
  const player = state.players[playerId];
  if (!player) return;
  const hero = heroDef(module, player.heroId);
  if (hero.ability.usage === "oncePerTurn") player.abilityUsedThisTurn = true;
  if (hero.ability.usage === "oncePerGame") player.oncePerGameUsed = true;
  emit(state, "ability", `${player.name}: ${hero.ability.name}`, { playerId, heroId: hero.id });
  pushEffects(state, hero.ability.effects, contextFor(state, playerId, undefined, "ability"));
}

function rollDie(state: GameState, module: GameModule, playerId: string, dieId: string): void {
  const dieState = state.items.dice.find((die) => die.id === dieId);
  const def = module.config.dice.find((die) => die.id === dieId);
  if (!dieState || !def || def.faces.length === 0) return;
  const roll = nextInt(state.rng, def.faces.length);
  state.rng = roll.state;
  const face = def.faces[roll.value];
  if (!face) return;
  dieState.available = false;
  dieState.lastFaceId = face.id;
  const player = state.players[playerId];
  emit(state, "die", `${player?.name ?? "Игрок"} бросает ${def.name}: ${face.label}`, {
    playerId,
    dieId,
    faceId: face.id,
  });
  pushEffects(state, face.effects, contextFor(state, playerId, undefined, "die"));
}

function spendToken(state: GameState, module: GameModule, playerId: string, tokenId: string): void {
  const token = state.items.tokens[tokenId];
  const def = module.config.tokens.find((item) => item.id === tokenId);
  if (!token || !def) return;
  const held = token.holders[playerId] ?? 0;
  if (held <= 0) return;
  token.holders[playerId] = held - 1;
  token.supply += 1;
  emit(state, "token", `${state.players[playerId]?.name ?? "Игрок"} тратит «${def.name}»`, { playerId, tokenId });
  pushEffects(state, def.spendEffects ?? [], contextFor(state, playerId, undefined, "token"));
}

function useProp(state: GameState, module: GameModule, playerId: string, propId: string): void {
  const propState = state.items.props.find((prop) => prop.id === propId);
  const def = module.config.props.find((prop) => prop.id === propId);
  if (!propState || !def) return;
  propState.usesThisTurn += 1;
  emit(state, "prop", `${state.players[playerId]?.name ?? "Игрок"} использует «${def.name}»`, { playerId, propId });
  pushEffects(state, def.effects, contextFor(state, playerId, undefined, "prop"));
}

function choose(state: GameState, optionId: string): void {
  const pending = state.pending;
  if (!pending) return;
  const index = pending.options.findIndex((option) => option.id === optionId);
  const effects = pending.optionEffects[index] ?? [];
  const context = pending.context;
  state.pending = null;
  emit(state, "choice", `Выбор: ${pending.options[index]?.label ?? optionId}`, { optionId });
  pushEffects(state, effects, context);
}

/** Applies a command and resolves the effects it queued. Automatic turns stay with the phase runner. */
export function executeAndResolve(state: GameState, module: GameModule, command: Command): void {
  executeCommand(state, module, command);
  resolveStack(state, module);
}
