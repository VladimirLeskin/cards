import { defineModule, gainPool } from "@deckforge/engine";
import type { CardDefinition, EffectHandler, GameConfig, HeroDefinition } from "@deckforge/engine";

const art = "assets/hogwarts";

const hogwartsHandlers: Record<string, EffectHandler> = {
  patronus(ctx) {
    const player = ctx.state.players[ctx.context.controllerId];
    if (!player) return;
    const allies = player.zones.play.filter((instanceId) => {
      const instance = ctx.state.cards[instanceId];
      if (!instance) return false;
      return ctx.module.cards.get(instance.definitionId)?.tags.includes("ally") ?? false;
    }).length;
    const amount = Math.max(1, allies);
    gainPool(ctx.state, ctx.module, player.id, "attack", amount);
    ctx.emit("patronus", `Патронус даёт ${amount} атаки`, { amount });
  },
};

function copies(id: string, count: number): string[] {
  return Array.from({ length: count }, () => id);
}

const cards: CardDefinition[] = [
  {
    id: "hp-strike",
    name: "Учебное заклинание",
    kind: "starter",
    text: "Получите 1 атаку.",
    image: `${art}/cards/hp-strike.svg`,
    tags: ["spell"],
    provides: [{ resource: "attack", amount: 1 }],
  },
  {
    id: "hp-gather",
    name: "Сбор ингредиентов",
    kind: "starter",
    text: "Получите 1 влияние.",
    image: `${art}/cards/hp-gather.svg`,
    tags: ["item"],
    provides: [{ resource: "influence", amount: 1 }],
  },
  {
    id: "hp-sip",
    name: "Глоток зелья",
    kind: "starter",
    text: "Получите 1 лечение.",
    image: `${art}/cards/hp-sip.svg`,
    tags: ["item"],
    provides: [{ resource: "heal", amount: 1 }],
  },
  {
    id: "hp-spark",
    name: "Искра",
    kind: "market",
    text: "Получите 1 атаку и 1 влияние.",
    image: `${art}/cards/hp-spark.svg`,
    tags: ["spell"],
    cost: 2,
    provides: [
      { resource: "attack", amount: 1 },
      { resource: "influence", amount: 1 },
    ],
  },
  {
    id: "hp-potion",
    name: "Целебный настой",
    kind: "market",
    text: "Получите 2 лечения.",
    image: `${art}/cards/hp-potion.svg`,
    tags: ["item"],
    cost: 2,
    provides: [{ resource: "heal", amount: 2 }],
  },
  {
    id: "hp-bolt",
    name: "Оглушающий заряд",
    kind: "market",
    text: "Получите 2 атаки.",
    image: `${art}/cards/hp-bolt.svg`,
    tags: ["spell"],
    cost: 3,
    provides: [{ resource: "attack", amount: 2 }],
  },
  {
    id: "hp-shield",
    name: "Щит чар",
    kind: "market",
    text: "Получите 1 атаку и 1 лечение.",
    image: `${art}/cards/hp-shield.svg`,
    tags: ["spell"],
    cost: 3,
    provides: [
      { resource: "attack", amount: 1 },
      { resource: "heal", amount: 1 },
    ],
  },
  {
    id: "hp-ally",
    name: "Союзник факультета",
    kind: "market",
    text: "Возьмите карту. Союзник остаётся в игре.",
    image: `${art}/cards/hp-ally.svg`,
    tags: ["ally"],
    cost: 4,
    stays: true,
    effects: [{ trigger: "onPlay", effects: [{ op: "draw", amount: 1 }] }],
  },
  {
    id: "hp-cloak",
    name: "Мантия покровителя",
    kind: "market",
    text: "Получите атаку по числу союзников в игре, минимум 1. Остаётся в игре.",
    image: `${art}/cards/hp-cloak.svg`,
    tags: ["ally", "spell"],
    cost: 5,
    stays: true,
    effects: [{ trigger: "onPlay", effects: [{ op: "custom", id: "patronus" }] }],
  },
  {
    id: "hp-cultist",
    name: "Приспешник",
    kind: "enemy",
    text: "Атака 1.",
    image: `${art}/cards/hp-cultist.svg`,
    tags: ["villain"],
    health: 4,
    attack: 1,
    reward: [{ op: "gain", resource: "influence", amount: 1 }],
  },
  {
    id: "hp-troll",
    name: "Тролль коридора",
    kind: "enemy",
    text: "Атака 2.",
    image: `${art}/cards/hp-troll.svg`,
    tags: ["villain"],
    health: 6,
    attack: 2,
    reward: [{ op: "gain", resource: "influence", amount: 2 }],
  },
  {
    id: "hp-specter",
    name: "Тень подземелья",
    kind: "enemy",
    text: "Атака 2. Награда: возьмите карту.",
    image: `${art}/cards/hp-specter.svg`,
    tags: ["villain"],
    health: 5,
    attack: 2,
    reward: [{ op: "draw", amount: 1 }],
  },
  {
    id: "hp-dungeons",
    name: "Подземелья",
    kind: "location",
    text: "Один враг. Одно событие за ход.",
    image: `${art}/cards/hp-dungeons.svg`,
    tags: ["location"],
    health: 12,
    enemyCount: 1,
    eventCount: 1,
    maxEnemies: 2,
  },
  {
    id: "hp-hall",
    name: "Большой зал",
    kind: "location",
    text: "Два врага. Два события за ход. В начале хода активный герой получает 1 урон.",
    image: `${art}/cards/hp-hall.svg`,
    tags: ["location"],
    health: 16,
    enemyCount: 2,
    eventCount: 2,
    maxEnemies: 3,
    effects: [{ trigger: "onTurnStart", effects: [{ op: "damagePlayer", amount: 1, target: "current" }] }],
  },
  {
    id: "hp-hex",
    name: "Порча",
    kind: "event",
    text: "Активный герой получает 1 урон.",
    image: `${art}/cards/hp-hex.svg`,
    tags: ["dark"],
    effects: [{ trigger: "onReveal", effects: [{ op: "damagePlayer", amount: 1, target: "current" }] }],
  },
  {
    id: "hp-reinforce",
    name: "Подкрепление",
    kind: "event",
    text: "Выходит враг. Если слоты заняты, локация захвачена.",
    image: `${art}/cards/hp-reinforce.svg`,
    tags: ["dark"],
    effects: [{ trigger: "onReveal", effects: [{ op: "addEnemy" }] }],
  },
  {
    id: "hp-drain",
    name: "Истощение",
    kind: "event",
    text: "Сбросьте карту или получите 1 урон.",
    image: `${art}/cards/hp-drain.svg`,
    tags: ["dark"],
    effects: [
      {
        trigger: "onReveal",
        effects: [
          {
            op: "discard",
            amount: 1,
            mode: "choice",
            orElse: [{ op: "damagePlayer", amount: 1, target: "current" }],
          },
        ],
      },
    ],
  },
  {
    id: "hp-curse",
    name: "Проклятие",
    kind: "event",
    text: "Каждый герой получает 1 урон.",
    image: `${art}/cards/hp-curse.svg`,
    tags: ["dark"],
    effects: [{ trigger: "onReveal", effects: [{ op: "damagePlayer", amount: 1, target: "all" }] }],
  },
];

function deck(strike: number, gather: number, sip: number) {
  return [
    { definitionId: "hp-strike", count: strike },
    { definitionId: "hp-gather", count: gather },
    { definitionId: "hp-sip", count: sip },
  ];
}

const heroes: HeroDefinition[] = [
  {
    id: "harry",
    name: "Гарри Поттер",
    image: `${art}/hero.svg`,
    health: 10,
    ability: {
      name: "Избранный",
      text: "Раз за ход получите 1 атаку.",
      usage: "oncePerTurn",
      effects: [{ op: "gain", resource: "attack", amount: 1 }],
    },
    startingDeck: deck(6, 2, 1),
  },
  {
    id: "ron",
    name: "Рон Уизли",
    image: `${art}/hero.svg`,
    health: 10,
    ability: {
      name: "Верный друг",
      text: "Раз за ход возьмите карту.",
      usage: "oncePerTurn",
      effects: [{ op: "draw", amount: 1 }],
    },
    startingDeck: deck(3, 3, 3),
  },
  {
    id: "hermione",
    name: "Гермиона Грейнджер",
    image: `${art}/hero.svg`,
    health: 10,
    ability: {
      name: "Патронус",
      text: "Раз за ход получите атаку по числу союзников в игре, минимум 1.",
      usage: "oncePerTurn",
      effects: [{ op: "custom", id: "patronus" }],
    },
    startingDeck: deck(2, 6, 1),
  },
  {
    id: "neville",
    name: "Невилл Долгопупс",
    image: `${art}/hero.svg`,
    health: 10,
    ability: {
      name: "Травология",
      text: "В начале хода восстановите 1 здоровье.",
      usage: "passive",
      effects: [{ op: "heal", amount: 1, target: "current" }],
    },
    startingDeck: deck(4, 4, 1),
  },
];

const config: GameConfig = {
  id: "hogwarts",
  title: "Битва за Хогвартс",
  description:
    "Кооперативная колода по мотивам «Гарри Поттер. Битва за Хогвартс»: влияние покупает заклинания, атака бьёт врагов и локацию, события тьмы открываются в начале хода. Побеждённые враги не возвращаются. Пустая колода событий проигрывает партию.",
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
    { id: "influence", name: "Влияние", role: "currency", persistence: "turn", icon: `${art}/icons/influence.svg`, min: 0 },
    { id: "heal", name: "Лечение", role: "heal", persistence: "turn", icon: `${art}/icons/heal.svg`, min: 0 },
  ],
  mechanics: {
    handSize: 5,
    marketSize: 6,
    enemySlots: 2,
    eventsPerTurn: "location",
    enemyRefill: "never",
    emptyEventDeck: "lose",
    emptyEnemyDeck: "ignore",
    stunOnZeroHealth: true,
    loseIfAllStunned: true,
    handVisibility: "open",
    attackLocationWhileEnemies: true,
    maxTurns: 16,
    buyDestination: "discard",
  },
  dice: [
    {
      id: "house-die",
      name: "Кубик факультета",
      image: `${art}/die.svg`,
      description: "Раз за ход. Грань задаёт эффект этого хода.",
      faces: [
        { id: "lion", label: "Лев", effects: [{ op: "gain", resource: "attack", amount: 2 }] },
        { id: "badger", label: "Барсук", effects: [{ op: "gain", resource: "heal", amount: 2 }] },
        { id: "eagle", label: "Орёл", effects: [{ op: "draw", amount: 1 }] },
        { id: "snake", label: "Змея", effects: [{ op: "gain", resource: "influence", amount: 2 }] },
        { id: "scar", label: "Шрам", effects: [{ op: "damagePlayer", amount: 1, target: "current" }] },
        {
          id: "spark",
          label: "Искра",
          effects: [
            { op: "gain", resource: "attack", amount: 1 },
            { op: "gain", resource: "influence", amount: 1 },
          ],
        },
      ],
    },
  ],
  tokens: [],
  props: [],
  cards,
  heroes,
  piles: {
    market: [
      ...copies("hp-spark", 2),
      ...copies("hp-potion", 2),
      ...copies("hp-bolt", 2),
      ...copies("hp-shield", 2),
      ...copies("hp-ally", 2),
      ...copies("hp-cloak", 1),
    ],
    enemies: [...copies("hp-cultist", 3), ...copies("hp-troll", 2), ...copies("hp-specter", 2)],
    locations: ["hp-dungeons", "hp-hall"],
    events: [
      ...copies("hp-hex", 6),
      ...copies("hp-reinforce", 6),
      ...copies("hp-drain", 6),
      ...copies("hp-curse", 6),
    ],
  },
};

export const hogwartsModule = defineModule(config, hogwartsHandlers);
