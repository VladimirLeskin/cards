import { cardDef, heroDef, resourceByRole } from "./module.js";
import { activePlayer, remainingHealth } from "./flow.js";
import type { Command, GameModule, GameState, LegalAction } from "./types.js";

export function commandsEqual(a: Command, b: Command): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** The seat that is allowed to submit a command, if the match is waiting on a player. */
export function actorId(state: GameState): string | null {
  if (state.status !== "playing") return null;
  if (state.pending) return state.pending.playerId;
  if (state.phase.id === "action") return activePlayer(state).id;
  return null;
}

export function legalActions(state: GameState, module: GameModule, playerId: string): LegalAction[] {
  const actor = actorId(state);
  if (!actor || actor !== playerId) return [];
  if (state.pending) {
    return state.pending.options.map((option) => ({
      command: { type: "choose", playerId, optionId: option.id },
      label: option.label,
    }));
  }

  const player = state.players[playerId];
  if (!player || player.stunned) return [];
  const actions: LegalAction[] = [];

  const hero = heroDef(module, player.heroId);
  const abilityReady =
    hero.ability.usage === "oncePerTurn"
      ? !player.abilityUsedThisTurn
      : hero.ability.usage === "oncePerGame"
        ? !player.oncePerGameUsed
        : false;
  if (abilityReady) {
    actions.push({
      command: { type: "activateAbility", playerId },
      label: `Способность: ${hero.ability.name}`,
    });
  }

  for (const die of state.items.dice) {
    if (!die.available) continue;
    const def = module.config.dice.find((item) => item.id === die.id);
    actions.push({
      command: { type: "rollDie", playerId, dieId: die.id },
      label: `Бросить: ${def?.name ?? die.id}`,
    });
  }

  for (const propState of state.items.props) {
    const def = module.config.props.find((item) => item.id === propState.id);
    if (!def) continue;
    const ready = def.usage === "unlimited" || propState.usesThisTurn === 0;
    if (!ready) continue;
    actions.push({
      command: { type: "useProp", playerId, propId: def.id },
      label: `Предмет: ${def.name}`,
    });
  }

  for (const tokenDef of module.config.tokens) {
    if (!tokenDef.spendEffects?.length) continue;
    const held = state.items.tokens[tokenDef.id]?.holders[playerId] ?? 0;
    if (held <= 0) continue;
    actions.push({
      command: { type: "spendToken", playerId, tokenId: tokenDef.id },
      label: `Потратить: ${tokenDef.name}`,
    });
  }

  for (const instanceId of player.zones.hand) {
    const def = cardDef(module, state.cards[instanceId]!.definitionId);
    actions.push({
      command: { type: "playCard", playerId, instanceId },
      label: `Сыграть: ${def.name}`,
    });
  }

  const attack = resourceByRole(module, "attack");
  const attackPool = attack ? (player.pools[attack.id] ?? 0) : 0;
  if (attack && attackPool > 0) {
    for (const instanceId of state.board.enemies.active) {
      const left = remainingHealth(state, module, instanceId);
      if (left <= 0) continue;
      const amount = Math.min(attackPool, left);
      const def = cardDef(module, state.cards[instanceId]!.definitionId);
      actions.push({
        command: { type: "assignAttack", playerId, target: { type: "enemy", instanceId }, amount },
        label: `Атака ${amount} → ${def.name}`,
      });
    }
    const locationId = state.board.locations.active;
    const locationOpen =
      locationId &&
      !state.cards[locationId]?.resolved &&
      (module.config.mechanics.attackLocationWhileEnemies || state.board.enemies.active.length === 0);
    if (locationId && locationOpen) {
      const left = remainingHealth(state, module, locationId);
      if (left > 0) {
        const amount = Math.min(attackPool, left);
        const def = cardDef(module, state.cards[locationId]!.definitionId);
        actions.push({
          command: { type: "assignAttack", playerId, target: { type: "location" }, amount },
          label: `Атака ${amount} → ${def.name}`,
        });
      }
    }
  }

  const heal = resourceByRole(module, "heal");
  const healPool = heal ? (player.pools[heal.id] ?? 0) : 0;
  if (heal && healPool > 0) {
    for (const targetId of state.turnOrder) {
      const target = state.players[targetId];
      if (!target || target.stunned || target.health >= target.maxHealth) continue;
      const amount = Math.min(healPool, target.maxHealth - target.health);
      actions.push({
        command: { type: "assignHeal", playerId, targetPlayerId: targetId, amount },
        label: `Лечение ${amount} → ${target.name}`,
      });
    }
  }

  const currency = resourceByRole(module, "currency");
  const purse = currency ? (player.pools[currency.id] ?? 0) : 0;
  if (currency) {
    for (const instanceId of state.board.market.row) {
      if (!instanceId) continue;
      const def = cardDef(module, state.cards[instanceId]!.definitionId);
      if (def.cost == null || def.cost > purse) continue;
      actions.push({
        command: { type: "buyCard", playerId, instanceId },
        label: `Купить: ${def.name} (${def.cost})`,
      });
    }
  }

  actions.push({ command: { type: "endTurn", playerId }, label: "Закончить ход" });
  return actions;
}

export function rejectionReason(state: GameState, module: GameModule, command: Command): string | null {
  if (state.status !== "playing") return "Match is over";
  const actions = legalActions(state, module, command.playerId);
  if (!actions.some((action) => commandsEqual(action.command, command))) return "Illegal action";
  return null;
}
