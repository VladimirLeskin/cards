import { chooseAiAction } from "./ai";
import { executeAndResolve } from "./commands";
import { resolveStack } from "./effects";
import {
  activePlayer,
  damagePlayer,
  discardFromZone,
  discardPlayedCards,
  drawCards,
  effectsFor,
  emit,
  finishGame,
  pushEffects,
  refillMarket,
  resetTurnPools,
  revealEvents,
} from "./flow";
import { legalActions } from "./legal";
import { cardDef } from "./module";
import type { GameModule, GameState, PhaseState } from "./types";

const freshPhase = (id: PhaseState["id"], step: string): PhaseState => ({
  id,
  step,
  cursor: 0,
  queue: [],
});

export function runUntilBlocked(state: GameState, module: GameModule): void {
  let guard = 0;
  let phaseKey = "";
  let phaseSteps = 0;
  while (state.status === "playing" && guard < 20_000) {
    guard += 1;
    const key = `${state.turn}:${state.activePlayerIndex}:${state.phase.id}`;
    if (key !== phaseKey) {
      phaseKey = key;
      phaseSteps = 0;
    }
    phaseSteps += 1;
    if (phaseSteps > 500) {
      if (state.phase.id === "action" && !state.pending) {
        state.phase = freshPhase("cleanup", "begin");
        continue;
      }
      finishGame(state, "lost", "loop-guard");
      return;
    }

    if (state.pending) {
      const decider = state.players[state.pending.playerId];
      if (!decider || decider.controller !== "ai") return;
      const actions = legalActions(state, module, decider.id);
      const choice = chooseAiAction(state, module, actions);
      if (!choice || choice.command.type !== "choose") {
        finishGame(state, "lost", "ai-stuck");
        return;
      }
      executeAndResolve(state, module, choice.command);
      continue;
    }

    if (state.phase.id === "threat") {
      stepThreat(state, module);
      continue;
    }
    if (state.phase.id === "cleanup") {
      stepCleanup(state, module);
      continue;
    }
    if (state.phase.id === "action") {
      const player = activePlayer(state);
      if (player.stunned) {
        state.phase = freshPhase("cleanup", "begin");
        continue;
      }
      if (player.controller !== "ai") return;
      const actions = legalActions(state, module, player.id);
      const action = chooseAiAction(state, module, actions);
      if (!action) {
        state.phase = freshPhase("cleanup", "begin");
        continue;
      }
      executeAndResolve(state, module, action.command);
      continue;
    }
    return;
  }
  if (state.status === "playing") finishGame(state, "lost", "loop-guard");
}

function stepThreat(state: GameState, module: GameModule): void {
  if (state.status !== "playing") return;
  const phase = state.phase;

  if (phase.step === "begin") {
    const player = activePlayer(state);
    if (player.stunned) {
      player.stunned = false;
      player.health = player.maxHealth;
      drawCards(state, module, player.id, module.config.mechanics.handSize);
      emit(state, "recover", `${player.name} приходит в себя`, { playerId: player.id });
    }
    phase.step = "passive";
    return;
  }

  if (phase.step === "passive") {
    const player = activePlayer(state);
    const hero = module.heroes.get(player.heroId);
    if (hero?.ability.usage === "passive") {
      pushEffects(state, hero.ability.effects, {
        controllerId: player.id,
        trigger: "passive",
      });
      resolveStack(state, module);
    }
    phase.step = "location";
    return;
  }

  if (phase.step === "location") {
    const locationId = state.board.locations.active;
    if (locationId && state.status === "playing") {
      const def = cardDef(module, state.cards[locationId]!.definitionId);
      const effects = effectsFor(def, "onTurnStart");
      if (effects.length > 0) {
        pushEffects(state, effects, {
          controllerId: activePlayer(state).id,
          sourceInstanceId: locationId,
          trigger: "onTurnStart",
        });
        resolveStack(state, module);
      }
    }
    phase.step = "reveal";
    return;
  }

  if (phase.step === "reveal") {
    revealEvents(state, module);
    phase.step = "events";
    phase.cursor = 0;
    return;
  }

  if (phase.step === "events") {
    if (state.status !== "playing") return;
    const revealed = state.board.events.revealed;
    if (phase.cursor >= revealed.length) {
      phase.step = "enemies";
      phase.cursor = 0;
      phase.queue = [];
      return;
    }
    const instanceId = revealed[phase.cursor];
    phase.cursor += 1;
    if (!instanceId) return;
    const def = cardDef(module, state.cards[instanceId]!.definitionId);
    const effects = effectsFor(def, "onReveal");
    if (effects.length > 0) {
      pushEffects(state, effects, {
        controllerId: activePlayer(state).id,
        sourceInstanceId: instanceId,
        trigger: "onReveal",
      });
      resolveStack(state, module);
    }
    return;
  }

  if (phase.step === "enemies") {
    if (state.status !== "playing") return;
    if (phase.queue.length === 0 && phase.cursor === 0) {
      phase.queue = [...state.board.enemies.active];
    }
    if (phase.cursor >= phase.queue.length) {
      phase.step = "upkeep";
      phase.cursor = 0;
      phase.queue = [];
      return;
    }
    const instanceId = phase.queue[phase.cursor];
    phase.cursor += 1;
    if (!instanceId || !state.board.enemies.active.includes(instanceId)) return;
    const def = cardDef(module, state.cards[instanceId]!.definitionId);
    if ((def.attack ?? 0) > 0) {
      damagePlayer(state, module, activePlayer(state).id, def.attack ?? 0);
    }
    if (state.status !== "playing") return;
    if (activePlayer(state).stunned) {
      phase.step = "upkeep";
      phase.cursor = 0;
      phase.queue = [];
      return;
    }
    const onAttack = effectsFor(def, "onAttack");
    if (onAttack.length > 0 && state.board.enemies.active.includes(instanceId)) {
      pushEffects(state, onAttack, {
        controllerId: activePlayer(state).id,
        sourceInstanceId: instanceId,
        trigger: "onAttack",
      });
      resolveStack(state, module);
    }
    return;
  }

  if (phase.step === "upkeep") {
    phase.step = "to-action";
    if (state.status === "playing" && module.config.mechanics.enemyRefill === "upkeep") {
      const locationId = state.board.locations.active;
      if (locationId && !state.cards[locationId]?.resolved) {
        const def = cardDef(module, state.cards[locationId]!.definitionId);
        const need = (def.enemyCount ?? 0) - state.board.enemies.active.length;
        if (need > 0) {
          pushEffects(
            state,
            [{ op: "spawnEnemies", amount: need }],
            { controllerId: activePlayer(state).id, sourceInstanceId: locationId, trigger: "upkeep" },
          );
          resolveStack(state, module);
        }
      }
    }
    if (state.pending || state.status !== "playing") return;
    beginAction(state);
    return;
  }

  if (phase.step === "to-action") {
    beginAction(state);
    return;
  }

  beginAction(state);
}

function beginAction(state: GameState): void {
  if (state.status !== "playing") return;
  if (activePlayer(state).stunned) {
    state.phase = freshPhase("cleanup", "begin");
    return;
  }
  state.phase = freshPhase("action", "play");
}

function stepCleanup(state: GameState, module: GameModule): void {
  const player = activePlayer(state);
  discardFromZone(player, "hand");
  discardPlayedCards(state, module, player);
  resetTurnPools(state, module, player);
  player.abilityUsedThisTurn = false;
  for (const die of state.items.dice) {
    die.available = true;
    delete die.lastFaceId;
  }
  for (const prop of state.items.props) prop.usesThisTurn = 0;

  const revealed = state.board.events.revealed.splice(0, state.board.events.revealed.length);
  state.board.events.discard.push(...revealed);
  if (!player.stunned) {
    const need = module.config.mechanics.handSize - player.zones.hand.length;
    if (need > 0) drawCards(state, module, player.id, need);
  }
  refillMarket(state);

  const count = state.turnOrder.length;
  state.activePlayerIndex = (state.activePlayerIndex + 1) % count;
  if (state.activePlayerIndex === 0) state.turn += 1;
  if (state.turn > module.config.mechanics.maxTurns) {
    finishGame(state, "lost", "turn-limit");
    return;
  }
  state.phase = freshPhase("threat", "begin");
  emit(state, "turn", `Ход ${state.turn}: ${activePlayer(state).name}`, {
    turn: state.turn,
    playerId: activePlayer(state).id,
  });
}
