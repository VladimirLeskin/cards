import { applyCommand } from "./apply";
import { legalActions } from "./legal";
import { createInitialState } from "./setup";
import { runUntilBlocked } from "./phases";
import { projectView } from "./view";
import type {
  ApplyResult,
  ClientView,
  Command,
  CreateMatchOptions,
  GameEvent,
  GameModule,
  GameState,
  LegalAction,
} from "./types";

type Listener = (events: GameEvent[]) => void;

export class Match {
  private listeners = new Set<Listener>();

  private constructor(
    private state: GameState,
    private readonly module: GameModule,
  ) {}

  static create(module: GameModule, options: CreateMatchOptions): Match {
    const seed = options.seed ?? Math.floor(Math.random() * 1_000_000_000) + 1;
    const state = createInitialState(module, options, seed);
    runUntilBlocked(state, module);
    return new Match(state, module);
  }

  static restore(serialized: string, module: GameModule): Match {
    const state = JSON.parse(serialized) as GameState;
    if (!state || state.configId !== module.config.id || !state.matchId) {
      throw new Error("Снимок партии не подходит к этой игре");
    }
    return new Match(state, module);
  }

  get id(): string {
    return this.state.matchId;
  }

  get gameId(): string {
    return this.state.configId;
  }

  getState(): GameState {
    return structuredClone(this.state);
  }

  view(playerId?: string): ClientView {
    return projectView(this.state, this.module, playerId);
  }

  legalActions(playerId?: string): LegalAction[] {
    const actor = playerId ?? actorFrom(this.state);
    if (!actor) return [];
    return legalActions(this.state, this.module, actor);
  }

  submit(command: Command): ApplyResult {
    const result = applyCommand(this.state, this.module, command);
    if (result.ok) this.state = result.state;
    if (result.events.length > 0) {
      for (const listener of this.listeners) listener(result.events);
    }
    return { ...result, state: structuredClone(this.state) };
  }

  /** Host save. Includes deck order — do not send this blob to players. */
  serialize(): string {
    return JSON.stringify(this.state);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

function actorFrom(state: GameState): string | null {
  if (state.pending) return state.pending.playerId;
  if (state.status === "playing" && state.phase.id === "action") {
    return state.turnOrder[state.activePlayerIndex] ?? null;
  }
  return null;
}
