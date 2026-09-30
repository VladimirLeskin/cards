import type { CardDefinition, EffectHandler, GameConfig, GameModule, HeroDefinition } from "./types.js";

export function defineModule(
  config: GameConfig,
  handlers: Record<string, EffectHandler> = {},
): GameModule {
  return {
    config,
    handlers,
    cards: new Map(config.cards.map((card) => [card.id, card])),
    heroes: new Map(config.heroes.map((hero) => [hero.id, hero])),
  };
}

export function cardDef(module: GameModule, definitionId: string): CardDefinition {
  const def = module.cards.get(definitionId);
  if (!def) throw new Error(`Unknown card definition: ${definitionId}`);
  return def;
}

export function heroDef(module: GameModule, heroId: string): HeroDefinition {
  const def = module.heroes.get(heroId);
  if (!def) throw new Error(`Unknown hero: ${heroId}`);
  return def;
}

export function resourceByRole(module: GameModule, role: "attack" | "currency" | "heal") {
  return module.config.resources.find((resource) => resource.role === role);
}

export function activePlayerId(state: { turnOrder: string[]; activePlayerIndex: number }): string {
  const id = state.turnOrder[state.activePlayerIndex];
  if (!id) throw new Error("No active player");
  return id;
}
