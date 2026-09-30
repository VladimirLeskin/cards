export { DeckEngine } from "./core/engine";
export { Match } from "./core/match";
export { defineModule } from "./core/module";
export { GameRegistry } from "./core/registry";
export { SetupError } from "./core/setup";
export { TableSession } from "./core/session";
export type { SeatBinding } from "./core/session";
export { validateModule } from "./core/validate";
export { anatomyParkModule } from "./games/anatomy-park/module";
export { hogwartsModule } from "./games/hogwarts/module";

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
} from "./core/types";

import { DeckEngine } from "./core/engine";
import { anatomyParkModule } from "./games/anatomy-park/module";
import { hogwartsModule } from "./games/hogwarts/module";
import { GameRegistry } from "./core/registry";

export function createDefaultRegistry(): GameRegistry {
  const registry = new GameRegistry();
  registry.register(hogwartsModule);
  registry.register(anatomyParkModule);
  return registry;
}

export function createEngine(): DeckEngine {
  return new DeckEngine(createDefaultRegistry());
}
