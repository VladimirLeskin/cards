import type { Command, LegalAction } from "@deckforge/engine";

const groups: { type: Command["type"]; text: string }[] = [
  { type: "playCard", text: "карты в руке" },
  { type: "buyCard", text: "карты на рынке" },
  { type: "assignAttack", text: "цели атаки, по 1 за нажатие" },
  { type: "assignHeal", text: "героев для лечения, по 1 за нажатие" },
  { type: "acknowledge", text: "«К действиям»" },
  { type: "activateAbility", text: "способность" },
  { type: "rollDie", text: "кубик" },
  { type: "spendToken", text: "жетон" },
  { type: "useProp", text: "предмет" },
  { type: "endTurn", text: "«Закончить ход»" },
];

/** One line that names every group of controls the player can press. */
export function actionHint(actions: LegalAction[]): string {
  if (actions.length === 0) return "";
  if (actions.every((action) => action.command.type === "choose")) {
    return "Нажмите один из подсвеченных вариантов.";
  }
  if (actions.every((action) => action.command.type === "acknowledge")) {
    return "Посмотрите, что сделала угроза, затем нажмите «К действиям».";
  }
  const present = new Set(actions.map((action) => action.command.type));
  const parts = groups.filter((group) => present.has(group.type)).map((group) => group.text);
  if (parts.length === 0) return "Подсвечены доступные действия.";
  return `Можно нажать: ${parts.join(", ")}.`;
}

/** Short badge for a card or hero that accepts a click. */
export function actionMark(command: Command): string {
  if (command.type === "playCard") return "сыграть";
  if (command.type === "buyCard") return "купить";
  if (command.type === "assignAttack") return "атака 1";
  if (command.type === "assignHeal") return "лечение 1";
  return "";
}

export function setupHint(count: number, limits: { min: number; max: number }): string {
  const parts = ["«Начать партию»"];
  if (count < limits.max) parts.push("«Добавить игрока»");
  if (count > limits.min) parts.push("«Убрать игрока»");
  return `Можно нажать: ${parts.join(", ")}.`;
}
