export { DeckEngine } from "./core/engine";
export { gainPool } from "./core/flow";
export { Match } from "./core/match";
export { defineModule } from "./core/module";
export { GameRegistry } from "./core/registry";
export { SetupError } from "./core/setup";
export { TableSession } from "./core/session";
export type { SeatBinding } from "./core/session";
export { validateModule } from "./core/validate";

export type {
  ApplyResult,
  CardDefinition,
  CardKind,
  CardView,
  ClientView,
  Command,
  Controller,
  CreateMatchOptions,
  Effect,
  EffectHandler,
  GameConfig,
  GameModule,
  GameState,
  HeroDefinition,
  LegalAction,
  MechanicsConfig,
  PlayerSetup,
  PlayerState,
  PlayerView,
  PropDefinition,
  ResourceDefinition,
  Side,
  TokenDefinition,
  DieDefinition,
} from "./core/types";

import { DeckEngine } from "./core/engine";
import { GameRegistry } from "./core/registry";
import type { GameModule } from "./core/types";

export function createEngine(modules: GameModule[]): DeckEngine {
  const registry = new GameRegistry();
  for (const game of modules) registry.register(game);
  return new DeckEngine(registry);
}
