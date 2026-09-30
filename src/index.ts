export { DeckEngine } from "./core/engine.js";
export { Match } from "./core/match.js";
export { defineModule } from "./core/module.js";
export { GameRegistry } from "./core/registry.js";
export { SetupError } from "./core/setup.js";
export { TableSession } from "./core/session.js";
export type { SeatBinding } from "./core/session.js";
export { validateModule } from "./core/validate.js";
export { anatomyParkModule } from "./games/anatomy-park/module.js";
export { hogwartsModule } from "./games/hogwarts/module.js";

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
  PropDefinition,
  ResourceDefinition,
  Side,
  TokenDefinition,
  DieDefinition,
} from "./core/types.js";

import { DeckEngine } from "./core/engine.js";
import { anatomyParkModule } from "./games/anatomy-park/module.js";
import { hogwartsModule } from "./games/hogwarts/module.js";
import { GameRegistry } from "./core/registry.js";

export function createDefaultRegistry(): GameRegistry {
  const registry = new GameRegistry();
  registry.register(hogwartsModule);
  registry.register(anatomyParkModule);
  return registry;
}

export function createEngine(): DeckEngine {
  return new DeckEngine(createDefaultRegistry());
}
