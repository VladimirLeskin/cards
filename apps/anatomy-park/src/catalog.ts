import type { ParkConfig, ParkTileDefinition } from "@deckforge/engine";

const art = "assets/anatomy-park";

function tile(
  id: string,
  name: string,
  text: string,
  kind: ParkTileDefinition["kind"],
  vp: number,
  extra: Partial<Pick<ParkTileDefinition, "color" | "bonus" | "focus" | "copies">> = {},
): ParkTileDefinition {
  return {
    id,
    name,
    text,
    image: `${art}/tiles/${id}.svg`,
    kind,
    vp,
    copies: extra.copies ?? 2,
    ...(extra.color ? { color: extra.color } : {}),
    ...(extra.bonus ? { bonus: extra.bonus } : {}),
    ...(extra.focus ? { focus: extra.focus } : {}),
  };
}

export const anatomyPark: ParkConfig = {
  id: "anatomy-park",
  title: "Анатомический парк",
  description:
    "Соревновательный парк внутри тела. Ставьте аттракционы рядом с собой, берите очки за соседство и успейте выйти, пока сердце не остановится.",
  playerCount: { min: 1, max: 4 },
  handLimit: 5,
  openingHand: 4,
  entrance: {
    name: "Вход",
    text: "Все начинают здесь. Этот тайл нельзя переставить.",
    image: `${art}/tiles/entrance.svg`,
  },
  tiles: [
    tile("lymph-fountain", "Фонтан лимфы", "Соседний синий тайл даёт +1.", "attraction", 2, {
      color: "blue",
      bonus: { color: "blue", vp: 1 },
    }),
    tile("neuron-gallery", "Галерея нейронов", "Соседняя горка даёт +2.", "attraction", 2, {
      color: "yellow",
      bonus: { kind: "ride", vp: 2 },
    }),
    tile("plasma-lake", "Озеро плазмы", "Соседний красный тайл даёт +1.", "attraction", 3, {
      color: "red",
      bonus: { color: "red", vp: 1 },
    }),
    tile("tendon-bridge", "Мост сухожилий", "Соседний транзит даёт +2.", "attraction", 1, {
      color: "brown",
      bonus: { kind: "transit", vp: 2 },
    }),
    tile("rib-cave", "Пещера рёбер", "Соседний выход даёт +2.", "attraction", 2, {
      color: "green",
      bonus: { kind: "exit", vp: 2 },
    }),
    tile("cartilage-tower", "Башня хряща", "Соседний жёлтый тайл даёт +2.", "attraction", 2, {
      color: "yellow",
      bonus: { color: "yellow", vp: 2 },
    }),
    tile("bile-stand", "Лавка желчи", "Соседняя еда даёт +2.", "food", 1, {
      color: "green",
      bonus: { kind: "food", vp: 2 },
    }),
    tile("enzyme-kiosk", "Киоск ферментов", "Соседний зелёный тайл даёт +2.", "food", 1, {
      color: "blue",
      bonus: { color: "green", vp: 2 },
    }),
    tile("aorta-loop", "Петля аорты", "Соседний аттракцион даёт +1.", "ride", 2, {
      color: "red",
      bonus: { kind: "attraction", vp: 1 },
    }),
    tile("vein-drop", "Венозный спуск", "Соседний красный тайл даёт +2.", "ride", 2, {
      color: "blue",
      bonus: { color: "red", vp: 2 },
    }),
    tile("canal", "Канал", "По каналу идут, не тратя шаг.", "transit", 0, { copies: 3 }),
    tile("lock", "Шлюз", "Транзит: шаг по нему бесплатный.", "transit", 1, { copies: 3 }),
    tile("outer-hatch", "Наружный люк", "Стоя на люке, можно выйти из парка.", "exit", 1, { color: "green" }),
    tile("spare-valve", "Запасной клапан", "Ещё один выход из парка.", "exit", 1, { color: "green" }),
    tile("gawkers", "Зеваки", "Фокус: +1 за каждого жёлтого соседа. На поле не кладётся.", "focus", 0, {
      focus: { color: "yellow", vp: 1 },
    }),
    tile("critics", "Критики", "Фокус: +2 за каждый соседний аттракцион. На поле не кладётся.", "focus", 0, {
      focus: { kind: "attraction", vp: 2 },
    }),
  ],
  diseases: [
    { id: "rash", name: "Сыпь", image: `${art}/diseases/rash.svg`, copies: 3 },
    { id: "fever", name: "Жар", image: `${art}/diseases/fever.svg`, copies: 3 },
    { id: "slime", name: "Слизь", image: `${art}/diseases/slime.svg`, copies: 2 },
    { id: "cramp", name: "Спазм", image: `${art}/diseases/cramp.svg`, copies: 2 },
  ],
  reactions: [
    { id: "sneeze", name: "Чихание", text: "На поле выходит болезнь.", image: `${art}/reactions/sneeze.svg`, effect: "spawn", copies: 3 },
    { id: "cough", name: "Кашель", text: "На поле выходит болезнь.", image: `${art}/reactions/cough.svg`, effect: "spawn", copies: 2 },
    { id: "shove", name: "Толчок", text: "Героя сдвигает на соседний тайл.", image: `${art}/reactions/shove.svg`, effect: "shove", copies: 2 },
    { id: "cramp", name: "Судорога", text: "Сбросьте тайл.", image: `${art}/reactions/cramp.svg`, effect: "discard", copies: 2 },
    { id: "hiccup", name: "Икота", text: "Сбросьте тайл.", image: `${art}/reactions/hiccup.svg`, effect: "discard", copies: 2 },
    { id: "heart", name: "Сердечный приступ", text: "Второй приступ закрывает парк.", image: `${art}/reactions/heart.svg`, effect: "heart", copies: 2 },
  ],
  characters: [
    { id: "rick", name: "Рик", image: `${art}/characters/rick.svg`, move: 3, combat: 2 },
    { id: "morty", name: "Морти", image: `${art}/characters/morty.svg`, move: 4, combat: 1 },
    { id: "summer", name: "Саммер", image: `${art}/characters/summer.svg`, move: 3, combat: 2 },
    { id: "beth", name: "Бет", image: `${art}/characters/beth.svg`, move: 2, combat: 3 },
  ],
};
