import type { Effect, GameModule } from "./types";

export function validateModule(module: GameModule): string[] {
  const errors: string[] = [];
  const { config } = module;
  const cardIds = new Set<string>();
  for (const card of config.cards) {
    if (cardIds.has(card.id)) errors.push(`Повторяющийся id карты: ${card.id}`);
    cardIds.add(card.id);
    if (!card.name.trim()) errors.push(`У карты ${card.id} нет имени`);
    if (!card.image.trim()) errors.push(`У карты ${card.id} нет изображения`);
    if (card.kind === "market" && (card.cost == null || card.cost < 0)) {
      errors.push(`У карты рынка ${card.id} нет стоимости`);
    }
    if ((card.kind === "enemy" || card.kind === "location") && !(card.health && card.health > 0)) {
      errors.push(`У карты ${card.id} нет здоровья`);
    }
    const slots = card.maxEnemies ?? config.mechanics.enemySlots;
    if (card.kind === "location" && (card.enemyCount ?? 0) > slots) {
      errors.push(`Локация ${card.id} выпускает больше врагов, чем есть слотов`);
    }
    for (const gain of card.provides ?? []) {
      if (!config.resources.some((resource) => resource.id === gain.resource)) {
        errors.push(`Карта ${card.id} даёт неизвестный ресурс ${gain.resource}`);
      }
    }
    walkEffects(card.effects?.flatMap((block) => block.effects) ?? [], module, errors, card.id);
    walkEffects(card.reward ?? [], module, errors, card.id);
  }

  const heroIds = new Set<string>();
  for (const hero of config.heroes) {
    if (heroIds.has(hero.id)) errors.push(`Повторяющийся id героя: ${hero.id}`);
    heroIds.add(hero.id);
    if (!hero.image.trim() || hero.health <= 0) errors.push(`Герой ${hero.id} задан неполно`);
    if (hero.startingDeck.length === 0) errors.push(`У героя ${hero.id} пустая стартовая колода`);
    for (const entry of hero.startingDeck) {
      const card = module.cards.get(entry.definitionId);
      if (!card) errors.push(`Стартовая колода ${hero.id} ссылается на ${entry.definitionId}`);
      else if (card.kind !== "starter") errors.push(`В стартовой колоде ${hero.id} карта не starter: ${card.id}`);
      if (entry.count <= 0) errors.push(`Некорректное число копий в колоде ${hero.id}`);
    }
    walkEffects(hero.ability.effects, module, errors, hero.id);
  }

  if (config.heroes.length < config.playerCount.min) {
    errors.push("Героев меньше, чем минимум игроков");
  }
  if (config.playerCount.min < 1 || config.playerCount.max < config.playerCount.min) {
    errors.push("Некорректное число игроков");
  }
  const { mechanics } = config;
  if (mechanics.handSize < 1 || mechanics.marketSize < 1 || mechanics.enemySlots < 1 || mechanics.maxTurns < 1) {
    errors.push("Некорректные параметры поля");
  }

  const roles = ["attack", "currency", "heal"] as const;
  for (const role of roles) {
    const found = config.resources.filter((resource) => resource.role === role);
    if (found.length > 1) errors.push(`Роль ресурса «${role}» задана больше одного раза`);
  }
  if (!config.resources.some((resource) => resource.role === "attack")) errors.push("Нет ресурса атаки");
  if (!config.resources.some((resource) => resource.role === "currency")) errors.push("Нет ресурса покупки");

  for (const [key, ids] of Object.entries(config.piles) as [keyof typeof config.piles, string[]][]) {
    const expected =
      key === "market" ? "market" : key === "enemies" ? "enemy" : key === "locations" ? "location" : "event";
    if (key === "locations" && ids.length === 0) errors.push("Нет локаций");
    for (const id of ids) {
      const card = module.cards.get(id);
      if (!card) errors.push(`Колода ${key} ссылается на неизвестную карту ${id}`);
      else if (card.kind !== expected) errors.push(`Карта ${id} лежит не в той колоде (${key})`);
    }
  }

  for (const value of Object.values(config.art)) {
    if (!value.trim()) errors.push("Пустой путь к изображению поля");
  }

  const dieIds = new Set<string>();
  for (const die of config.dice) {
    if (dieIds.has(die.id)) errors.push(`Повторяющийся кубик ${die.id}`);
    dieIds.add(die.id);
    if (!die.image.trim() || die.faces.length === 0) errors.push(`Кубик ${die.id} задан неполно`);
    for (const face of die.faces) walkEffects(face.effects, module, errors, die.id);
  }
  const tokenIds = new Set<string>();
  for (const token of config.tokens) {
    if (tokenIds.has(token.id)) errors.push(`Повторяющийся жетон ${token.id}`);
    tokenIds.add(token.id);
    if (!token.image.trim()) errors.push(`У жетона ${token.id} нет изображения`);
    walkEffects(token.spendEffects ?? [], module, errors, token.id);
  }
  const propIds = new Set<string>();
  for (const prop of config.props) {
    if (propIds.has(prop.id)) errors.push(`Повторяющийся предмет ${prop.id}`);
    propIds.add(prop.id);
    if (!prop.image.trim()) errors.push(`У предмета ${prop.id} нет изображения`);
    walkEffects(prop.effects, module, errors, prop.id);
  }
  return errors;
}

function walkEffects(effects: Effect[], module: GameModule, errors: string[], owner: string): void {
  for (const effect of effects) {
    if (effect.op === "custom" && !module.handlers[effect.id]) {
      errors.push(`${owner}: нет обработчика эффекта «${effect.id}»`);
    }
    if (effect.op === "gain" && !module.config.resources.some((resource) => resource.id === effect.resource)) {
      errors.push(`${owner}: неизвестный ресурс ${effect.resource}`);
    }
    if (effect.op === "gainCard" && !module.cards.has(effect.definitionId)) {
      errors.push(`${owner}: неизвестная карта ${effect.definitionId}`);
    }
    if (effect.op === "gainToken" && !module.config.tokens.some((token) => token.id === effect.tokenId)) {
      errors.push(`${owner}: неизвестный жетон ${effect.tokenId}`);
    }
    if (effect.op === "choice") {
      const ids = new Set<string>();
      for (const option of effect.options) {
        if (ids.has(option.id)) errors.push(`${owner}: повторяющийся вариант выбора ${option.id}`);
        ids.add(option.id);
        walkEffects(option.effects, module, errors, owner);
      }
    }
    if (effect.op === "discard" && effect.orElse) walkEffects(effect.orElse, module, errors, owner);
  }
}
