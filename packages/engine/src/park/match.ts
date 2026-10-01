import { chooseParkAction } from "./ai";
import { applyPark, characterDef, createParkState, legalPark, phasePrompt, recover, tileDef } from "./rules";
import type {
  CreateParkOptions,
  ParkCardView,
  ParkCellView,
  ParkCommand,
  ParkConfig,
  ParkPlayerView,
  ParkState,
  ParkView,
} from "./types";

export class ParkMatch {
  private constructor(
    private state: ParkState,
    private readonly config: ParkConfig,
  ) {}

  static create(config: ParkConfig, options: CreateParkOptions): ParkMatch {
    const match = new ParkMatch(createParkState(config, options), config);
    match.pump();
    return match;
  }

  /** Resume a snapshot. Does not take AI turns until the next command. */
  static load(config: ParkConfig, state: ParkState): ParkMatch {
    if (state.configId !== config.id) throw new Error("Снимок не от этого парка");
    return new ParkMatch(structuredClone(state), config);
  }

  getState(): ParkState {
    return structuredClone(this.state);
  }

  view(): ParkView {
    recover(this.state, this.config);
    return project(this.state, this.config);
  }

  submit(command: ParkCommand): { ok: boolean; error?: string; state: ParkState } {
    const result = applyPark(this.state, this.config, command);
    if (!result.ok) return { ok: false, error: result.error, state: structuredClone(this.state) };
    this.state = result.state;
    this.pump();
    return { ok: true, state: structuredClone(this.state) };
  }

  private pump(): void {
    for (let guard = 0; guard < 500; guard += 1) {
      recover(this.state, this.config);
      if (this.state.status !== "playing") return;
      const player = this.state.players[this.state.turnOrder[this.state.active]!]!;
      if (player.controller !== "ai") return;
      const actions = legalPark(this.state, this.config, player.id);
      const choice = chooseParkAction(this.state, this.config, actions);
      if (!choice) return;
      const result = applyPark(this.state, this.config, choice.command);
      if (!result.ok) return;
      this.state = result.state;
    }
  }
}

function project(state: ParkState, config: ParkConfig): ParkView {
  const active = state.players[state.turnOrder[state.active]!]!;
  const box = bounds(state);
  const cells: ParkCellView[] = [];
  for (let y = box.minY; y <= box.maxY; y += 1) {
    for (let x = box.minX; x <= box.maxX; x += 1) {
      const instanceId = state.ground[`${x},${y}`];
      cells.push({
        x,
        y,
        tile: instanceId ? cardOf(state, config, instanceId) : null,
        players: Object.values(state.players)
          .filter((player) => player.x === x && player.y === y)
          .map((player) => ({ id: player.id, name: player.name })),
        diseases: state.diseases
          .filter((disease) => disease.x === x && disease.y === y)
          .map((disease) => ({
            id: disease.id,
            name: config.diseases.find((item) => item.id === disease.definitionId)?.name ?? disease.definitionId,
          })),
      });
    }
  }
  const players: ParkPlayerView[] = state.turnOrder.map((id) => {
    const player = state.players[id]!;
    const character = characterDef(config, player.characterId);
    return {
      id: player.id,
      name: player.name,
      controller: player.controller,
      characterId: character.id,
      characterName: character.name,
      image: character.image,
      move: character.move,
      combat: character.combat,
      x: player.x,
      y: player.y,
      exited: player.exited,
      vp: player.vp,
      handCount: player.hand.length,
    };
  });
  return {
    title: config.title,
    description: config.description,
    status: state.status,
    ...(state.outcome
      ? {
          outcome: {
            reason: state.outcome.reason,
            winners: state.outcome.winnerIds.map((id) => ({
              id,
              name: state.players[id]!.name,
              vp: state.players[id]!.vp,
            })),
          },
        }
      : {}),
    phase: state.phase,
    prompt: phasePrompt(state.phase, state.startNeed, config.handLimit),
    activePlayerId: active.id,
    round: state.round,
    hearts: state.hearts,
    closingLeft: state.closingLeft,
    tileDeckCount: state.tileDeck.length,
    reactionDeckCount: state.reactionDeck.length,
    players,
    hand: state.status === "playing" ? active.hand.map((instanceId) => cardOf(state, config, instanceId)) : [],
    cells,
    log: state.log.slice(-12),
    legalActions: state.status === "playing" ? legalPark(state, config, active.id) : [],
  };
}

function cardOf(state: ParkState, config: ParkConfig, instanceId: string): ParkCardView {
  const definitionId = state.pieces[instanceId]!.definitionId;
  if (definitionId === "entrance") {
    return {
      instanceId,
      definitionId,
      name: config.entrance.name,
      text: config.entrance.text,
      image: config.entrance.image,
      kind: "entrance",
      vp: 0,
    };
  }
  const tile = tileDef(config, definitionId);
  return {
    instanceId,
    definitionId,
    name: tile.name,
    text: tile.text,
    image: tile.image,
    kind: tile.kind,
    ...(tile.color ? { color: tile.color } : {}),
    vp: tile.vp,
  };
}

function bounds(state: ParkState): { minX: number; maxX: number; minY: number; maxY: number } {
  let minX = 0;
  let maxX = 0;
  let minY = 0;
  let maxY = 0;
  for (const key of Object.keys(state.ground)) {
    const [rawX, rawY] = key.split(",");
    const x = Number(rawX);
    const y = Number(rawY);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  return { minX: minX - 1, maxX: maxX + 1, minY: minY - 1, maxY: maxY + 1 };
}
