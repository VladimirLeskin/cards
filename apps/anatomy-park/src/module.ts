import { defineModule, gainPool } from "@deckforge/engine";
import type { CardDefinition, EffectHandler, GameConfig, HeroDefinition } from "@deckforge/engine";

const art = "assets/anatomy-park";

const anatomyHandlers: Record<string, EffectHandler> = {
  dissect(ctx) {
    const playerId = ctx.context.controllerId;
    const top = ctx.state.board.market.deck.pop();
    if (!top) {
      gainPool(ctx.state, ctx.module, playerId, "attack", 1);
      ctx.emit("dissect", "Колода рынка пуста — 1 атака", { amount: 1 });
      return;
    }
    const instance = ctx.state.cards[top];
    const def = instance ? ctx.module.cards.get(instance.definitionId) : undefined;
    ctx.state.board.banished.push(top);
    const amount = Math.max(1, def?.cost ?? 1);
    gainPool(ctx.state, ctx.module, playerId, "attack", amount);
    ctx.emit("dissect", `Вскрытие даёт ${amount} атаки`, { amount, definitionId: def?.id ?? null });
  },
};

function copies(id: string, count: number): string[] {
  return Array.from({ length: count }, () => id);
}

const cards: CardDefinition[] = [
  {
    id: "ap-swipe",
    name: "Удар скальпелем",
    kind: "starter",
    text: "Получите 1 атаку.",
    image: `${art}/cards/ap-swipe.svg`,
    tags: ["tool"],
    provides: [{ resource: "attack", amount: 1 }],
  },
  {
    id: "ap-vial",
    name: "Пробирка",
    kind: "starter",
    text: "Получите 1 образец.",
    image: `${art}/cards/ap-vial.svg`,
    tags: ["tool"],
    provides: [{ resource: "samples", amount: 1 }],
  },
  {
    id: "ap-bandage",
    name: "Бинт",
    kind: "starter",
    text: "Получите 1 сыворотку.",
    image: `${art}/cards/ap-bandage.svg`,
    tags: ["tool"],
    provides: [{ resource: "heal", amount: 1 }],
  },
  {
    id: "ap-laser",
    name: "Лазерный резак",
    kind: "market",
    text: "Получите 2 атаки.",
    image: `${art}/cards/ap-laser.svg`,
    tags: ["tool"],
    cost: 3,
    provides: [{ resource: "attack", amount: 2 }],
  },
  {
    id: "ap-serum",
    name: "Сыворотка",
    kind: "market",
    text: "Получите 2 сыворотки.",
    image: `${art}/cards/ap-serum.svg`,
    tags: ["item"],
    cost: 2,
    provides: [{ resource: "heal", amount: 2 }],
  },
  {
    id: "ap-gadget",
    name: "Полевой гаджет",
    kind: "market",
    text: "Получите 1 атаку и 1 образец.",
    image: `${art}/cards/ap-gadget.svg`,
    tags: ["tool"],
    cost: 3,
    provides: [
      { resource: "attack", amount: 1 },
      { resource: "samples", amount: 1 },
    ],
  },
  {
    id: "ap-intern",
    name: "Стажёр",
    kind: "market",
    text: "Возьмите карту и получите жетон образца. Остаётся в игре.",
    image: `${art}/cards/ap-intern.svg`,
    tags: ["ally"],
    cost: 4,
    stays: true,
    effects: [
      {
        trigger: "onPlay",
        effects: [
          { op: "draw", amount: 1 },
          { op: "gainToken", tokenId: "sample", amount: 1, to: "current" },
        ],
      },
    ],
  },
  {
    id: "ap-scalpel",
    name: "Вскрытие",
    kind: "market",
    text: "Сбросьте верх рынка в изгнание и получите атаку, равную его цене.",
    image: `${art}/cards/ap-scalpel.svg`,
    tags: ["tool"],
    cost: 4,
    effects: [{ trigger: "onPlay", effects: [{ op: "custom", id: "dissect" }] }],
  },
  {
    id: "ap-armor",
    name: "Защитный костюм",
    kind: "market",
    text: "Получите 1 атаку и 1 сыворотку.",
    image: `${art}/cards/ap-armor.svg`,
    tags: ["item"],
    cost: 2,
    provides: [
      { resource: "attack", amount: 1 },
      { resource: "heal", amount: 1 },
    ],
  },
  {
    id: "ap-mite",
    name: "Клещ",
    kind: "enemy",
    text: "Атака 1. После победы на его место выходит следующий паразит.",
    image: `${art}/cards/ap-mite.svg`,
    tags: ["parasite"],
    health: 4,
    attack: 1,
    reward: [{ op: "gainToken", tokenId: "sample", amount: 1, to: "current" }],
  },
  {
    id: "ap-crawler",
    name: "Ползун",
    kind: "enemy",
    text: "Атака 1.",
    image: `${art}/cards/ap-crawler.svg`,
    tags: ["parasite"],
    health: 5,
    attack: 1,
  },
  {
    id: "ap-organ",
    name: "Одержимый орган",
    kind: "enemy",
    text: "Атака 2.",
    image: `${art}/cards/ap-organ.svg`,
    tags: ["parasite"],
    health: 6,
    attack: 2,
    reward: [{ op: "gain", resource: "samples", amount: 2 }],
  },
  {
    id: "ap-entrance",
    name: "Вход в парк",
    kind: "location",
    text: "Сектор. Один паразит, одно осложнение за ход.",
    image: `${art}/cards/ap-entrance.svg`,
    tags: ["sector"],
    health: 14,
    enemyCount: 1,
    eventCount: 1,
    maxEnemies: 3,
  },
  {
    id: "ap-core",
    name: "Ядро аттракциона",
    kind: "location",
    text: "Два паразита. Два осложнения за ход. В начале хода активный герой получает 1 урон.",
    image: `${art}/cards/ap-core.svg`,
    tags: ["sector"],
    health: 18,
    enemyCount: 2,
    eventCount: 2,
    maxEnemies: 3,
    effects: [{ trigger: "onTurnStart", effects: [{ op: "damagePlayer", amount: 1, target: "current" }] }],
  },
  {
    id: "ap-spasm",
    name: "Спазм",
    kind: "event",
    text: "Активный герой получает 1 урон.",
    image: `${art}/cards/ap-spasm.svg`,
    tags: ["complication"],
    effects: [{ trigger: "onReveal", effects: [{ op: "damagePlayer", amount: 1, target: "current" }] }],
  },
  {
    id: "ap-infestation",
    name: "Заражение",
    kind: "event",
    text: "Выходит паразит.",
    image: `${art}/cards/ap-infestation.svg`,
    tags: ["complication"],
    effects: [{ trigger: "onReveal", effects: [{ op: "addEnemy" }] }],
  },
  {
    id: "ap-fever",
    name: "Лихорадка",
    kind: "event",
    text: "Каждый герой получает 1 урон.",
    image: `${art}/cards/ap-fever.svg`,
    tags: ["complication"],
    effects: [{ trigger: "onReveal", effects: [{ op: "damagePlayer", amount: 1, target: "all" }] }],
  },
  {
    id: "ap-collapse",
    name: "Отказ системы",
    kind: "event",
    text: "Сбросьте карту или получите 2 урона.",
    image: `${art}/cards/ap-collapse.svg`,
    tags: ["complication"],
    effects: [
      {
        trigger: "onReveal",
        effects: [
          {
            op: "discard",
            amount: 1,
            mode: "choice",
            orElse: [{ op: "damagePlayer", amount: 2, target: "current" }],
          },
        ],
      },
    ],
  },
];

function deck(swipe: number, vial: number, bandage: number) {
  return [
    { definitionId: "ap-swipe", count: swipe },
    { definitionId: "ap-vial", count: vial },
    { definitionId: "ap-bandage", count: bandage },
  ];
}

const heroes: HeroDefinition[] = [
  {
    id: "rick",
    name: "Рик Санчез",
    image: `${art}/hero.svg`,
    health: 10,
    ability: {
      name: "Импровизация",
      text: "Раз за ход получите 1 атаку и 1 образец.",
      usage: "oncePerTurn",
      effects: [
        { op: "gain", resource: "attack", amount: 1 },
        { op: "gain", resource: "samples", amount: 1 },
      ],
    },
    startingDeck: deck(6, 2, 1),
  },
  {
    id: "morty",
    name: "Морти Смит",
    image: `${art}/hero.svg`,
    health: 10,
    ability: {
      name: "Нервы",
      text: "Раз за ход возьмите карту.",
      usage: "oncePerTurn",
      effects: [{ op: "draw", amount: 1 }],
    },
    startingDeck: deck(3, 3, 3),
  },
  {
    id: "summer",
    name: "Саммер Смит",
    image: `${art}/hero.svg`,
    health: 10,
    ability: {
      name: "Вскрытие",
      text: "Раз за ход сбросьте верх рынка в изгнание и получите атаку по его цене.",
      usage: "oncePerTurn",
      effects: [{ op: "custom", id: "dissect" }],
    },
    startingDeck: deck(2, 6, 1),
  },
  {
    id: "beth",
    name: "Бет Смит",
    image: `${art}/hero.svg`,
    health: 10,
    ability: {
      name: "Хирургия",
      text: "В начале хода восстановите 1 здоровье.",
      usage: "passive",
      effects: [{ op: "heal", amount: 1, target: "current" }],
    },
    startingDeck: deck(4, 4, 1),
  },
];

const config: GameConfig = {
  id: "anatomy-park",
  title: "Анатомический парк",
  description:
    "Кооперативная колода по мотивам «Рик и Морти. Анатомический парк»: образцы покупают карты, паразиты занимают секторы и после победы заменяются следующими. Колоды событий и паразитов перемешиваются заново. Портальная пушка и жетоны образцов — отдельные от карт предметы.",
  mode: "cooperative",
  playerCount: { min: 1, max: 4 },
  art: {
    cardBack: `${art}/card-back.svg`,
    board: `${art}/board.svg`,
    marketDeck: `${art}/market.svg`,
    enemyDeck: `${art}/enemy.svg`,
    eventDeck: `${art}/event.svg`,
    locationBack: `${art}/location.svg`,
  },
  resources: [
    { id: "attack", name: "Атака", role: "attack", persistence: "turn", icon: `${art}/icons/attack.svg`, min: 0 },
    { id: "samples", name: "Образцы", role: "currency", persistence: "turn", icon: `${art}/icons/samples.svg`, min: 0 },
    { id: "heal", name: "Сыворотка", role: "heal", persistence: "turn", icon: `${art}/icons/heal.svg`, min: 0 },
  ],
  mechanics: {
    handSize: 5,
    marketSize: 5,
    enemySlots: 3,
    eventsPerTurn: "location",
    enemyRefill: "onDefeat",
    emptyEventDeck: "reshuffle",
    emptyEnemyDeck: "reshuffle",
    stunOnZeroHealth: true,
    loseIfAllStunned: true,
    handVisibility: "open",
    attackLocationWhileEnemies: true,
    maxTurns: 18,
    buyDestination: "discard",
  },
  dice: [],
  tokens: [
    {
      id: "sample",
      name: "Образец",
      image: `${art}/token.svg`,
      description: "Потратьте, чтобы получить 1 атаку.",
      supply: 8,
      eachPlayer: 0,
      spendEffects: [{ op: "gain", resource: "attack", amount: 1 }],
    },
  ],
  props: [
    {
      id: "portal-gun",
      name: "Портальная пушка",
      image: `${art}/prop.svg`,
      description: "Раз за ход возьмите карту.",
      usage: "oncePerTurn",
      effects: [{ op: "draw", amount: 1 }],
    },
  ],
  cards,
  heroes,
  piles: {
    market: [
      ...copies("ap-serum", 2),
      ...copies("ap-armor", 2),
      ...copies("ap-laser", 2),
      ...copies("ap-gadget", 2),
      ...copies("ap-intern", 2),
      ...copies("ap-scalpel", 1),
    ],
    enemies: [...copies("ap-mite", 3), ...copies("ap-crawler", 2), ...copies("ap-organ", 2)],
    locations: ["ap-entrance", "ap-core"],
    events: [
      ...copies("ap-spasm", 3),
      ...copies("ap-infestation", 3),
      ...copies("ap-fever", 3),
      ...copies("ap-collapse", 3),
    ],
  },
};

export const anatomyParkModule = defineModule(config, anatomyHandlers);
