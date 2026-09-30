import { Match } from "./match.js";
import { GameRegistry } from "./registry.js";
import type { CreateMatchOptions } from "./types.js";

export class DeckEngine {
  constructor(private readonly registry: GameRegistry) {}

  listGames(): { id: string; title: string; description: string }[] {
    return this.registry.list();
  }

  getModule(gameId: string) {
    return this.registry.get(gameId);
  }

  createMatch(options: CreateMatchOptions): Match {
    return Match.create(this.registry.get(options.gameId), options);
  }

  restoreMatch(gameId: string, serialized: string): Match {
    return Match.restore(serialized, this.registry.get(gameId));
  }
}
