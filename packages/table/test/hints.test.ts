import { describe, expect, it } from "vitest";
import { actionHint, actionMark, setupHint } from "../src/hints";
import type { Command, LegalAction } from "@deckforge/engine";

function action(command: Command, label = command.type): LegalAction {
  return { command, label };
}

describe("action hints", () => {
  it("names each kind of control the player can press", () => {
    const text = actionHint([
      action({ type: "playCard", playerId: "p1", instanceId: "c1" }),
      action({ type: "buyCard", playerId: "p1", instanceId: "c2" }),
      action({ type: "endTurn", playerId: "p1" }),
    ]);
    expect(text).toBe("Можно нажать: карты в руке, карты на рынке, «Закончить ход».");
  });

  it("points at the choice buttons while a decision is open", () => {
    expect(actionHint([action({ type: "choose", playerId: "p1", optionId: "a" }, "Сбросить")])).toBe(
      "Нажмите один из подсвеченных вариантов.",
    );
  });

  it("stays quiet when nothing can be pressed", () => {
    expect(actionHint([])).toBe("");
  });

  it("badges cards and heroes with a short verb", () => {
    expect(actionMark({ type: "playCard", playerId: "p1", instanceId: "c1" })).toBe("сыграть");
    expect(actionMark({ type: "buyCard", playerId: "p1", instanceId: "c1" })).toBe("купить");
    expect(actionMark({ type: "assignAttack", playerId: "p1", target: { type: "location" }, amount: 1 })).toBe("атака 1");
    expect(actionMark({ type: "assignHeal", playerId: "p1", targetPlayerId: "p1", amount: 1 })).toBe("лечение 1");
    expect(actionHint([action({ type: "acknowledge", playerId: "p1" })])).toBe(
      "Посмотрите, что сделала угроза, затем нажмите «К действиям».",
    );
    expect(actionMark({ type: "endTurn", playerId: "p1" })).toBe("");
  });

  it("lists the setup buttons that are on screen", () => {
    expect(setupHint(1, { min: 1, max: 4 })).toBe("Можно нажать: «Начать партию», «Добавить игрока».");
    expect(setupHint(4, { min: 1, max: 4 })).toBe("Можно нажать: «Начать партию», «Убрать игрока».");
  });
});
