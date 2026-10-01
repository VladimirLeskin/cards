import { placeScore, tileDef } from "./rules";
import type { ParkConfig, ParkLegalAction, ParkState } from "./types";

export function chooseParkAction(
  state: ParkState,
  config: ParkConfig,
  actions: ParkLegalAction[],
): ParkLegalAction | null {
  if (actions.length === 0) return null;
  if (state.phase === "start" || state.phase === "trim" || state.phase === "reaction") {
    return cheapestDiscard(state, config, actions);
  }
  if (state.phase === "move") return chooseMove(state, actions);
  return chooseAction(state, config, actions);
}

function chooseMove(state: ParkState, actions: ParkLegalAction[]): ParkLegalAction {
  const player = state.players[actions[0]!.command.playerId]!;
  const here = diseasesAt(state, player.x, player.y);
  if (here > 0) {
    let best: ParkLegalAction | null = null;
    let bestCount = here;
    for (const action of actions) {
      const command = action.command;
      if (command.type !== "moveSelf") continue;
      const count = diseasesAt(state, command.x, command.y);
      if (count < bestCount) {
        best = action;
        bestCount = count;
      }
    }
    if (best) return best;
  } else if (openSides(state, player.x, player.y) === 0) {
    let best: ParkLegalAction | null = null;
    let bestRoom = 0;
    for (const action of actions) {
      const command = action.command;
      if (command.type !== "moveSelf") continue;
      const room = openSides(state, command.x, command.y);
      if (room > bestRoom) {
        best = action;
        bestRoom = room;
      }
    }
    if (best) return best;
  }
  return actions.find((action) => action.command.type === "moveDiseases") ?? actions[0]!;
}

function openSides(state: ParkState, x: number, y: number): number {
  return [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ].filter(([dx, dy]) => !state.ground[`${x + dx},${y + dy}`]).length;
}

function chooseAction(state: ParkState, config: ParkConfig, actions: ParkLegalAction[]): ParkLegalAction {
  const places = actions.filter((action) => action.command.type === "placeTile");
  if (places.length > 0) {
    let best = places[0]!;
    let bestScore = -1;
    for (const action of places) {
      const command = action.command;
      if (command.type !== "placeTile") continue;
      const score = placeScore(
        state,
        config,
        state.pieces[command.instanceId]!.definitionId,
        command.x,
        command.y,
        command.focusId,
      );
      if (score > bestScore) {
        best = action;
        bestScore = score;
      }
    }
    return best;
  }
  const player = state.players[actions[0]!.command.playerId]!;
  const pointBlank = actions.find((action) => shotHere(state, action, player.x, player.y));
  if (pointBlank) return pointBlank;
  return (
    actions.find((action) => action.command.type === "drawTiles") ??
    actions.find((action) => action.command.type === "shoot") ??
    actions.find((action) => action.command.type === "exitPark") ??
    actions[0]!
  );
}

function cheapestDiscard(state: ParkState, config: ParkConfig, actions: ParkLegalAction[]): ParkLegalAction {
  let best = actions[0]!;
  let vp = Infinity;
  for (const action of actions) {
    const command = action.command;
    if (command.type !== "discardTile") continue;
    const value = tileDef(config, state.pieces[command.instanceId]!.definitionId).vp;
    if (value < vp) {
      vp = value;
      best = action;
    }
  }
  return best;
}

function shotHere(state: ParkState, action: ParkLegalAction, x: number, y: number): boolean {
  const command = action.command;
  if (command.type !== "shoot") return false;
  const disease = state.diseases.find((item) => item.id === command.diseaseId);
  return disease?.x === x && disease.y === y;
}

function diseasesAt(state: ParkState, x: number, y: number): number {
  return state.diseases.filter((disease) => disease.x === x && disease.y === y).length;
}
