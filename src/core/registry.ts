import type { GameModule } from "./types.js";
import { validateModule } from "./validate.js";

export class GameRegistry {
  private readonly modules = new Map<string, GameModule>();

  register(module: GameModule): void {
    const errors = validateModule(module);
    if (errors.length > 0) {
      throw new Error(`Конфиг «${module.config.id}» не прошёл проверку:\n${errors.join("\n")}`);
    }
    if (this.modules.has(module.config.id)) {
      throw new Error(`Игра уже зарегистрирована: ${module.config.id}`);
    }
    this.modules.set(module.config.id, module);
  }

  get(gameId: string): GameModule {
    const module = this.modules.get(gameId);
    if (!module) throw new Error(`Неизвестная игра: ${gameId}`);
    return module;
  }

  list(): { id: string; title: string; description: string }[] {
    return [...this.modules.values()].map((module) => ({
      id: module.config.id,
      title: module.config.title,
      description: module.config.description,
    }));
  }
}
