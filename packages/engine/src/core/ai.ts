import { cardDef, heroDef } from "./module";
import { activePlayer, remainingHealth } from "./flow";
import type { Effect, GameModule, GameState, LegalAction } from "./types";

export function chooseAiAction(state: GameState, module: GameModule, actions: LegalAction[]): LegalAction | null {
  let best: LegalAction | null = null;
  let bestScore = -Infinity;
  for (const action of actions) {
    const score = scoreAction(state, module, action);
    if (score > bestScore) {
      best = action;
      bestScore = score;
    }
  }
  return best;
}

function scoreAction(state: GameState, module: GameModule, action: LegalAction): number {
  const command = action.command;
  switch (command.type) {
    case "choose": {
      const pending = state.pending;
      if (!pending) return 0;
      const index = pending.options.findIndex((option) => option.id === command.optionId);
      return scoreEffects(pending.optionEffects[index] ?? []);
    }
    case "activateAbility": {
      const hero = heroDef(module, state.players[command.playerId]!.heroId);
      return effectListHas(hero.ability.effects, "draw") ? 200 : 110;
    }
    case "rollDie":
      return 90;
    case "useProp":
      return 96;
    case "spendToken":
      return 60;
    case "playCard":
      return scorePlay(state, module, command.instanceId);
    case "assignAttack":
      return scoreAttack(state, module, command.playerId, command.target, command.amount);
    case "assignHeal": {
      const target = state.players[command.targetPlayerId];
      if (!target) return 0;
      if (target.health <= 2) return 160;
      return 15 + (target.maxHealth - target.health) * 2;
    }
    case "buyCard":
      return scoreBuy(state, module, command.instanceId);
    case "acknowledge":
      return 1_000;
    case "endTurn":
      return 0;
    default: {
      const unknown: never = command;
      return unknown;
    }
  }
}

function scorePlay(state: GameState, module: GameModule, instanceId: string): number {
  const def = cardDef(module, state.cards[instanceId]!.definitionId);
  let score = 80;
  for (const gain of def.provides ?? []) {
    const resource = module.config.resources.find((item) => item.id === gain.resource);
    if (resource?.role === "attack") score += gain.amount * 6;
    else if (resource?.role === "currency") score += gain.amount * 4;
    else if (resource?.role === "heal") score += gain.amount * 4;
    else score += gain.amount * 2;
  }
  const onPlay = def.effects?.filter((block) => block.trigger === "onPlay").flatMap((block) => block.effects);
  if (effectListHas(onPlay ?? [], "draw")) score += 25;
  if (effectListHas(onPlay ?? [], "custom")) score += 8;
  return score;
}

function scoreAttack(
  state: GameState,
  module: GameModule,
  playerId: string,
  target: { type: "enemy"; instanceId: string } | { type: "location" },
  amount: number,
): number {
  const player = state.players[playerId] ?? activePlayer(state);
  if (target.type === "location") {
    const locationId = state.board.locations.active;
    if (!locationId) return 0;
    const left = remainingHealth(state, module, locationId);
    if (amount >= left) return 130;
    return state.board.enemies.active.length === 0 ? 90 : 50;
  }
  const def = cardDef(module, state.cards[target.instanceId]!.definitionId);
  const left = remainingHealth(state, module, target.instanceId);
  const lethal = amount >= left;
  const sticks = killSticks(state, module);
  const threatening = (def.attack ?? 0) >= player.health && player.health > 0;
  if (lethal && sticks) return 140 + (def.attack ?? 0) * 3;
  if (lethal && threatening) return 150;
  if (lethal) return 30;
  if (sticks) return 55;
  return 15;
}

function killSticks(state: GameState, module: GameModule): boolean {
  if (module.config.mechanics.enemyRefill !== "onDefeat") return true;
  if (state.board.enemies.deck.length > 0) return false;
  if (module.config.mechanics.emptyEnemyDeck === "reshuffle") return false;
  return true;
}

function scoreBuy(state: GameState, module: GameModule, instanceId: string): number {
  const def = cardDef(module, state.cards[instanceId]!.definitionId);
  let value = 12;
  for (const gain of def.provides ?? []) value += gain.amount * 6;
  const onPlay = def.effects?.filter((block) => block.trigger === "onPlay").flatMap((block) => block.effects) ?? [];
  if (effectListHas(onPlay, "draw")) value += 14;
  if (def.tags.includes("ally")) value += 6;
  if (effectListHas(onPlay, "heal") || effectListHas(onPlay, "gain")) value += 4;
  return 36 + value - (def.cost ?? 0) * 2;
}

function scoreEffects(effects: Effect[]): number {
  let score = 0;
  for (const effect of effects) {
    switch (effect.op) {
      case "damagePlayer":
      case "damagePlayerDirect":
        score -= 15 * effect.amount;
        break;
      case "stun":
      case "stunPlayer":
        score -= 30;
        break;
      case "addEnemy":
        score -= 40;
        break;
      case "spawnEnemies":
        score -= 20 * effect.amount;
        break;
      case "damageEnemy":
      case "damageEnemyInstance":
        score += 20 * effect.amount;
        break;
      case "damageLocation":
        score += 18 * effect.amount;
        break;
      case "heal":
      case "healPlayer":
        score += 12 * effect.amount;
        break;
      case "gain":
        score += 8 * effect.amount;
        break;
      case "draw":
      case "drawPlayer":
        score += 10 * effect.amount;
        break;
      case "discard":
        score -= 6 * effect.amount;
        if (effect.orElse) score += scoreEffects(effect.orElse) * 0.25;
        break;
      case "gainCard":
        score += 8;
        break;
      case "gainToken":
        score += 6 * effect.amount;
        break;
      case "custom":
        score += 5;
        break;
      case "choice":
        score += Math.max(...effect.options.map((option) => scoreEffects(option.effects)), 0);
        break;
      case "closeLocation":
        score += effect.result === "completed" ? 25 : -50;
        break;
      default:
        break;
    }
  }
  return score;
}

function effectListHas(effects: Effect[], op: Effect["op"]): boolean {
  for (const effect of effects) {
    if (effect.op === op) return true;
    if (effect.op === "choice" && effect.options.some((option) => effectListHas(option.effects, op))) return true;
    if (effect.op === "discard" && effect.orElse && effectListHas(effect.orElse, op)) return true;
  }
  return false;
}
