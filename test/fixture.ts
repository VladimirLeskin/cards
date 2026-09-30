import { defineModule } from "../src/core/module.js";
import type { EffectHandler, GameConfig, GameModule } from "../src/core/types.js";

export function fixtureGame(
  patch?: (config: GameConfig) => void,
  handlers: Record<string, EffectHandler> = {},
): GameModule {
  const config = baseConfig();
  patch?.(config);
  return defineModule(config, handlers);
}

function baseConfig(): GameConfig {
  return {
    id: "fixture",
    title: "Стенд",
    description: "Минимальная партия для тестов.",
    mode: "cooperative",
    playerCount: { min: 1, max: 2 },
    art: {
      cardBack: "assets/fixture/back.svg",
      board: "assets/fixture/board.svg",
      marketDeck: "assets/fixture/market.svg",
      enemyDeck: "assets/fixture/enemy.svg",
      eventDeck: "assets/fixture/event.svg",
      locationBack: "assets/fixture/location.svg",
    },
    resources: [
      { id: "attack", name: "Атака", role: "attack", persistence: "turn", icon: "assets/fixture/attack.svg", min: 0 },
      { id: "coins", name: "Монеты", role: "currency", persistence: "turn", icon: "assets/fixture/coins.svg", min: 0 },
      { id: "heal", name: "Лечение", role: "heal", persistence: "turn", icon: "assets/fixture/heal.svg", min: 0 },
    ],
    mechanics: {
      handSize: 5,
      marketSize: 1,
      enemySlots: 1,
      eventsPerTurn: 0,
      enemyRefill: "never",
      emptyEventDeck: "ignore",
      emptyEnemyDeck: "ignore",
      stunOnZeroHealth: true,
      loseIfAllStunned: true,
      handVisibility: "open",
      attackLocationWhileEnemies: true,
      maxTurns: 8,
      buyDestination: "discard",
    },
    dice: [],
    tokens: [],
    props: [],
    cards: [
      {
        id: "spark",
        name: "Искра",
        kind: "starter",
        text: "1 атака и 1 монета.",
        image: "assets/fixture/starter.svg",
        tags: [],
        provides: [
          { resource: "attack", amount: 1 },
          { resource: "coins", amount: 1 },
        ],
      },
      {
        id: "purse",
        name: "Кошель",
        kind: "starter",
        text: "2 монеты.",
        image: "assets/fixture/starter.svg",
        tags: [],
        provides: [{ resource: "coins", amount: 2 }],
      },
      {
        id: "item",
        name: "Покупка",
        kind: "market",
        text: "2 атаки.",
        image: "assets/fixture/market.svg",
        tags: [],
        cost: 2,
        provides: [{ resource: "attack", amount: 2 }],
      },
      {
        id: "brute",
        name: "Громила",
        kind: "enemy",
        text: "Атака 1.",
        image: "assets/fixture/enemy.svg",
        tags: [],
        health: 4,
        attack: 1,
      },
      {
        id: "gate",
        name: "Ворота",
        kind: "location",
        text: "Тестовая локация.",
        image: "assets/fixture/location.svg",
        tags: [],
        health: 5,
        enemyCount: 0,
        eventCount: 0,
        maxEnemies: 1,
      },
      {
        id: "gate-2",
        name: "Вторые ворота",
        kind: "location",
        text: "Вторая локация.",
        image: "assets/fixture/location.svg",
        tags: [],
        health: 5,
        enemyCount: 0,
        eventCount: 0,
        maxEnemies: 1,
      },
      {
        id: "ping",
        name: "Сигнал",
        kind: "event",
        text: "Получите 1 монету.",
        image: "assets/fixture/event.svg",
        tags: [],
        effects: [{ trigger: "onReveal", effects: [{ op: "gain", resource: "coins", amount: 1 }] }],
      },
      {
        id: "boom",
        name: "Удар",
        kind: "event",
        text: "Все получают 1 урон.",
        image: "assets/fixture/event.svg",
        tags: [],
        effects: [{ trigger: "onReveal", effects: [{ op: "damagePlayer", amount: 1, target: "all" }] }],
      },
      {
        id: "rush",
        name: "Натиск",
        kind: "event",
        text: "Выходит враг.",
        image: "assets/fixture/event.svg",
        tags: [],
        effects: [{ trigger: "onReveal", effects: [{ op: "addEnemy" }] }],
      },
      {
        id: "fork",
        name: "Развилка",
        kind: "event",
        text: "Выберите награду.",
        image: "assets/fixture/event.svg",
        tags: [],
        effects: [
          {
            trigger: "onReveal",
            effects: [
              {
                op: "choice",
                prompt: "Что берём?",
                options: [
                  { id: "attack", label: "Атака", effects: [{ op: "gain", resource: "attack", amount: 1 }] },
                  { id: "hurt", label: "Рана", effects: [{ op: "damagePlayer", amount: 1, target: "current" }] },
                ],
              },
            ],
          },
        ],
      },
    ],
    heroes: [
      {
        id: "ada",
        name: "Ада",
        image: "assets/fixture/hero.svg",
        health: 10,
        ability: {
          name: "Рывок",
          text: "Раз за ход получите 1 атаку.",
          usage: "oncePerTurn",
          effects: [{ op: "gain", resource: "attack", amount: 1 }],
        },
        startingDeck: [{ definitionId: "spark", count: 5 }],
      },
      {
        id: "ben",
        name: "Бен",
        image: "assets/fixture/hero.svg",
        health: 10,
        ability: {
          name: "Пасс",
          text: "Раз за игру получите 1 монету.",
          usage: "oncePerGame",
          effects: [{ op: "gain", resource: "coins", amount: 1 }],
        },
        startingDeck: [{ definitionId: "spark", count: 5 }],
      },
    ],
    piles: {
      market: ["item", "item", "item"],
      enemies: [],
      locations: ["gate"],
      events: [],
    },
  };
}
