import type { Controller, ParkCommand, ParkConfig, ParkMatch, ParkView } from "@deckforge/engine";
import { ParkMatch as Match } from "@deckforge/engine";

interface Seat {
  name: string;
  controller: Controller;
  characterId: string;
}

const kindLabel: Record<string, string> = {
  attraction: "аттракцион",
  food: "еда",
  ride: "горка",
  transit: "транзит",
  exit: "выход",
  focus: "фокус",
  entrance: "вход",
};

const phaseLabel: Record<ParkView["phase"], string> = {
  start: "Болезнь",
  move: "Переход",
  action: "Действие",
  trim: "Рука",
  reaction: "Реакция",
};

const reasonLabel: Record<string, string> = {
  heart: "Сердечный приступ закрыл парк",
  tiles: "Тайлы кончились",
  exits: "Все выбрались",
  time: "Время парка вышло",
};

export function mountPark(root: HTMLElement, config: ParkConfig): void {
  let match: ParkMatch | null = null;
  let seats: Seat[] = [{ name: "Рик", controller: "human", characterId: config.characters[0]?.id ?? "rick" }];
  let selected: string | null = null;
  let focusId: string | null = null;
  let shiftMode = false;
  let shiftFrom: { x: number; y: number } | null = null;
  let note = "";

  const paint = () => {
    root.innerHTML = match ? matchHtml(match.view()) : setupHtml();
    bind();
  };

  const send = (command: ParkCommand) => {
    if (!match) return;
    const result = match.submit(command);
    selected = null;
    focusId = null;
    shiftMode = false;
    shiftFrom = null;
    note = result.ok ? "" : (result.error ?? "Нельзя так сходить");
    paint();
  };

  const bind = () => {
    root.querySelector<HTMLButtonElement>("[data-act=add]")?.addEventListener("click", () => {
      if (seats.length >= config.playerCount.max) return;
      const used = new Set(seats.map((seat) => seat.characterId));
      const character = config.characters.find((item) => !used.has(item.id));
      if (!character) return;
      seats = [...seats, { name: character.name, controller: "ai", characterId: character.id }];
      paint();
    });
    root.querySelectorAll<HTMLButtonElement>("[data-act=remove]").forEach((button) => {
      button.addEventListener("click", () => {
        const index = Number(button.dataset.index);
        if (seats.length <= config.playerCount.min) return;
        seats = seats.filter((_, seatIndex) => seatIndex !== index);
        paint();
      });
    });
    root.querySelectorAll<HTMLInputElement>("[data-act=name]").forEach((input) => {
      input.addEventListener("input", () => {
        const index = Number(input.dataset.index);
        const seat = seats[index];
        if (seat) seat.name = input.value;
      });
    });
    root.querySelectorAll<HTMLSelectElement>("[data-act=controller]").forEach((select) => {
      select.addEventListener("change", () => {
        const seat = seats[Number(select.dataset.index)];
        if (seat) seat.controller = select.value === "ai" ? "ai" : "human";
      });
    });
    root.querySelectorAll<HTMLSelectElement>("[data-act=character]").forEach((select) => {
      select.addEventListener("change", () => {
        const seat = seats[Number(select.dataset.index)];
        if (seat) seat.characterId = select.value;
        paint();
      });
    });
    root.querySelector<HTMLButtonElement>("[data-act=start]")?.addEventListener("click", () => {
      const names = seats.map((seat) => seat.name.trim());
      if (names.some((name) => name.length === 0)) {
        note = "У каждого игрока должно быть имя";
        paint();
        return;
      }
      if (new Set(seats.map((seat) => seat.characterId)).size !== seats.length) {
        note = "Герои не должны повторяться";
        paint();
        return;
      }
      note = "";
      match = Match.create(config, {
        players: seats.map((seat) => ({ name: seat.name.trim(), controller: seat.controller, characterId: seat.characterId })),
      });
      paint();
    });
    root.querySelector<HTMLButtonElement>("[data-act=reset]")?.addEventListener("click", () => {
      match = null;
      selected = null;
      focusId = null;
      shiftMode = false;
      shiftFrom = null;
      note = "";
      paint();
    });
    root.querySelector<HTMLButtonElement>("[data-act=shift-mode]")?.addEventListener("click", () => {
      shiftMode = !shiftMode;
      shiftFrom = null;
      paint();
    });
    root.querySelectorAll<HTMLButtonElement>("[data-command]").forEach((button) => {
      button.addEventListener("click", () => {
        const view = match?.view();
        const action = view?.legalActions[Number(button.dataset.command)];
        if (action) send(action.command);
      });
    });
    root.querySelectorAll<HTMLButtonElement>("[data-act=pick]").forEach((button) => {
      button.addEventListener("click", () => {
        const instanceId = button.dataset.instance ?? "";
        const kind = button.dataset.kind ?? "";
        const view = match?.view();
        if (!view || view.phase !== "action") {
          note = "Тайл из руки кладётся после перехода. Сначала нажмите «Сдвинуть болезни» или клетку «Идти».";
          selected = null;
          focusId = null;
          paint();
          return;
        }
        note = "";
        if (kind === "focus") focusId = focusId === instanceId ? null : instanceId;
        else selected = selected === instanceId ? null : instanceId;
        paint();
      });
    });
    root.querySelectorAll<HTMLButtonElement>("[data-act=discard]").forEach((button) => {
      button.addEventListener("click", () => {
        const view = match?.view();
        const instanceId = button.dataset.instance ?? "";
        const action = view?.legalActions.find(
          (item) => item.command.type === "discardTile" && item.command.instanceId === instanceId,
        );
        if (action) send(action.command);
      });
    });
    root.querySelectorAll<HTMLButtonElement>("[data-act=cell]").forEach((button) => {
      button.addEventListener("click", () => {
        const view = match?.view();
        if (!view) return;
        const x = Number(button.dataset.x);
        const y = Number(button.dataset.y);
        if (view.phase === "move" && shiftMode && shiftFrom) {
          const shift = view.legalActions.find(
            (item) =>
              item.command.type === "shiftTile" &&
              item.command.fromX === shiftFrom?.x &&
              item.command.fromY === shiftFrom?.y &&
              item.command.toX === x &&
              item.command.toY === y,
          );
          shiftFrom = null;
          if (shift) send(shift.command);
          else paint();
          return;
        }
        if (view.phase === "move" && shiftMode) {
          const source = view.legalActions.some(
            (item) => item.command.type === "shiftTile" && item.command.fromX === x && item.command.fromY === y,
          );
          if (source) {
            shiftFrom = { x, y };
            paint();
          }
          return;
        }
        if (view.phase === "move") {
          const move = view.legalActions.find(
            (item) => item.command.type === "moveSelf" && item.command.x === x && item.command.y === y,
          );
          if (move) send(move.command);
          return;
        }
        if (view.phase !== "action" || !selected) return;
        const place = view.legalActions.find((item) => {
          if (item.command.type !== "placeTile") return false;
          if (item.command.instanceId !== selected || item.command.x !== x || item.command.y !== y) return false;
          return focusId ? item.command.focusId === focusId : !item.command.focusId;
        });
        if (place) send(place.command);
      });
    });
  };

  const setupHtml = () => {
    const used = new Set(seats.map((seat) => seat.characterId));
    const seatsHtml = seats
      .map((seat, index) => {
        const options = config.characters
          .filter((character) => character.id === seat.characterId || !used.has(character.id))
          .map(
            (character) =>
              `<option value="${esc(character.id)}" ${character.id === seat.characterId ? "selected" : ""}>${esc(character.name)} · ход ${character.move}, кубики ${character.combat}</option>`,
          )
          .join("");
        return `<div class="seat">
          <label>Имя<input data-testid="player-name" data-act="name" data-index="${index}" value="${esc(seat.name)}" /></label>
          <label>Кто ходит<select data-act="controller" data-index="${index}">
            <option value="human" ${seat.controller === "human" ? "selected" : ""}>Человек</option>
            <option value="ai" ${seat.controller === "ai" ? "selected" : ""}>Компьютер</option>
          </select></label>
          <label>Герой<select data-testid="character" data-act="character" data-index="${index}">${options}</select></label>
          ${seats.length > config.playerCount.min ? `<button type="button" data-act="remove" data-index="${index}">Убрать</button>` : ""}
        </div>`;
      })
      .join("");
    return `<section class="setup" data-testid="setup">
      <header>
        <h1>${esc(config.title)}</h1>
        <p class="lede">${esc(config.description)}</p>
      </header>
      ${seatsHtml}
      <div class="setup-actions">
        ${seats.length < config.playerCount.max ? `<button type="button" data-testid="add-player" data-act="add">Добавить игрока</button>` : ""}
        <button type="button" class="primary" data-testid="start-match" data-act="start">Открыть парк</button>
      </div>
      ${note ? `<p class="note" data-testid="note">${esc(note)}</p>` : ""}
      <p class="help">Ход: если на клетке болезнь, сбросьте тайл. Затем перейдите, сдвиньте болезни или переставьте соседний тайл. Потом одно действие: положить тайл рядом, взять два, выстрелить или выйти с люка. Побеждает тот, у кого больше очков.</p>
    </section>`;
  };

  const matchHtml = (view: ParkView) => {
    if (selected && !view.hand.some((card) => card.instanceId === selected)) selected = null;
    if (focusId && !view.hand.some((card) => card.instanceId === focusId)) focusId = null;
    const xs = view.cells.map((cell) => cell.x);
    const ys = view.cells.map((cell) => cell.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const cols = Math.max(...xs) - minX + 1;
    const rows = Math.max(...ys) - minY + 1;
    const cells = view.cells
      .map((cell) => {
        const legal = cellLegal(view, cell.x, cell.y);
        const shifting = shiftFrom?.x === cell.x && shiftFrom?.y === cell.y;
        const people = cell.players
          .map((player) => {
            const info = view.players.find((item) => item.id === player.id);
            return `<span class="token player" title="${esc(player.name)}">${info ? `<img src="${esc(info.image)}" alt="" />` : ""}${esc(player.name.slice(0, 1))}</span>`;
          })
          .join("");
        const diseases = cell.diseases
          .map((disease) => `<span class="token disease" title="${esc(disease.name)}">${esc(disease.name.slice(0, 1))}</span>`)
          .join("");
        const mark = legal ? cellMark(view) : "";
        const here = cell.players.some((player) => player.id === view.activePlayerId);
        const body = cell.tile
          ? `<img src="${esc(cell.tile.image)}" alt="" /><span class="cell-name">${esc(cell.tile.name)}</span>${mark ? `<span class="cell-mark">${esc(mark)}</span>` : ""}`
          : `<span class="empty">${esc(mark)}</span>`;
        return `<button type="button" class="cell ${cell.tile ? `kind-${cell.tile.kind}` : "blank"} ${legal ? "is-legal" : ""} ${shifting ? "is-shift" : ""} ${here ? "is-hero" : ""}" style="grid-column:${cell.x - minX + 1};grid-row:${cell.y - minY + 1}" data-testid="cell" data-act="cell" data-x="${cell.x}" data-y="${cell.y}" data-legal="${legal ? "true" : "false"}">${body}<span class="tokens">${people}${diseases}</span></button>`;
      })
      .join("");
    const discarding = view.phase === "start" || view.phase === "trim" || view.phase === "reaction";
    const hand = view.hand
      .map((card) => {
        const picked = card.instanceId === selected || card.instanceId === focusId;
        const pickable = view.phase === "action" ? "is-pickable" : "";
        return `<div class="card ${picked ? "is-selected" : ""} ${pickable} kind-${card.kind}" data-testid="hand-card" data-instance="${esc(card.instanceId)}">
          <button type="button" class="pick" data-act="pick" data-instance="${esc(card.instanceId)}" data-kind="${card.kind}">
            <img src="${esc(card.image)}" alt="" />
            <span class="card-name">${esc(card.name)}</span>
            <span class="card-meta">${picked ? "выбран · " : ""}${kindLabel[card.kind] ?? card.kind}${card.vp ? ` · ${card.vp}` : ""}</span>
          </button>
          ${discarding ? `<button type="button" data-testid="discard" data-act="discard" data-instance="${esc(card.instanceId)}">Сбросить</button>` : ""}
        </div>`;
      })
      .join("");
    const shiftButton =
      view.phase === "move" && view.legalActions.some((action) => action.command.type === "shiftTile")
        ? `<button type="button" class="${shiftMode ? "primary" : ""}" data-testid="shift-mode" data-act="shift-mode">${shiftMode ? "Выберите тайл и пустую клетку" : "Переставить тайл"}</button>`
        : "";
    const tools = shiftButton + view.legalActions
      .map((action, index) => ({ action, index }))
      .filter(({ action }) => !["moveSelf", "placeTile", "shiftTile", "discardTile"].includes(action.command.type))
      .map(
        ({ action, index }) =>
          `<button type="button" class="primary" data-testid="tool-${action.command.type}" data-command="${index}">${esc(action.label)}</button>`,
      )
      .join("");
    const scores = view.players
      .map(
        (player) =>
          `<div class="score ${player.id === view.activePlayerId ? "is-active" : ""} ${player.exited ? "is-out" : ""}" data-testid="player">
            <img src="${esc(player.image)}" alt="" />
            <div><strong>${esc(player.name)}</strong><span>${esc(player.characterName)} · рука ${player.handCount}</span></div>
            <b data-testid="vp" data-player="${esc(player.id)}">${player.vp}</b>
          </div>`,
      )
      .join("");
    const outcome = view.outcome
      ? `<p class="outcome" data-testid="outcome">${esc(reasonLabel[view.outcome.reason] ?? view.outcome.reason)}. Впереди ${esc(view.outcome.winners.map((winner) => `${winner.name} (${winner.vp})`).join(", "))}</p>`
      : "";
    return `<section class="match" data-testid="match">
      <header class="top">
        <div>
          <h1>${esc(view.title)}</h1>
          <p class="phase" data-testid="phase" data-phase="${view.phase}">${phaseLabel[view.phase]} · круг ${view.round}</p>
          <p class="prompt" data-testid="prompt">${esc(stepText(view))}</p>
        </div>
        <button type="button" data-act="reset" data-testid="new-game">Новая партия</button>
      </header>
      ${outcome}
      ${note ? `<p class="note" data-testid="note">${esc(note)}</p>` : ""}
      <div class="layout">
        <div class="board-wrap">
          <div class="board" data-testid="board" style="grid-template-columns:repeat(${cols}, 96px);grid-template-rows:repeat(${rows}, 112px)">${cells}</div>
        </div>
        <aside>
          <div class="scores">${scores}</div>
          <p class="meta">Тайлы в колоде: ${view.tileDeckCount}. Реакции: ${view.reactionDeckCount}. Приступы: ${view.hearts}${view.closingLeft != null ? `. До закрытия ходов: ${view.closingLeft}` : ""}</p>
          <div class="toolbar" data-testid="toolbar">${tools}</div>
          <p class="hand-hint" data-testid="hint">${esc(stepText(view))}</p>
          <div class="hand" data-testid="hand">${hand || `<p class="muted">Рука пуста</p>`}</div>
          <ol class="log" data-testid="log">${view.log.map((entry) => `<li>${esc(entry.message)}</li>`).join("")}</ol>
        </aside>
      </div>
    </section>`;
  };

  const stepText = (view: ParkView): string => {
    if (view.status === "over") return "Парк закрыт.";
    if (view.phase === "start" || view.phase === "trim" || view.phase === "reaction") return view.prompt;
    if (view.phase === "move" && shiftMode && shiftFrom) return "Нажмите пустую клетку «Сюда» рядом с выбранным тайлом.";
    if (view.phase === "move" && shiftMode) return "Нажмите тайл на поле с меткой «Переставить».";
    if (view.phase === "move") {
      const canWalk = view.legalActions.some((action) => action.command.type === "moveSelf");
      return canWalk
        ? "Нажмите клетку «Идти» или кнопку «Сдвинуть болезни». Тайл из руки кладётся следующим шагом."
        : "Нажмите «Сдвинуть болезни». Затем выберите тайл в руке и клетку «Поставить».";
    }
    if (!selected && focusId) return "Фокус выбран. Теперь выберите тайл, который кладёте на поле.";
    if (!selected) return "Выберите тайл в руке. Затем нажмите зелёную клетку «Поставить» рядом с героем.";
    const card = view.hand.find((item) => item.instanceId === selected);
    const name = card ? `«${card.name}»` : "Тайл";
    return `${name} выбран. Нажмите зелёную клетку «Поставить» рядом с героем.`;
  };

  const cellMark = (view: ParkView): string => {
    if (view.phase === "move" && shiftMode && shiftFrom) return "Сюда";
    if (view.phase === "move" && shiftMode) return "Переставить";
    if (view.phase === "move") return "Идти";
    return "Поставить";
  };

  const cellLegal = (view: ParkView, x: number, y: number) => {
    if (view.phase === "move" && shiftMode && shiftFrom) {
      return view.legalActions.some(
        (item) =>
          item.command.type === "shiftTile" &&
          item.command.fromX === shiftFrom?.x &&
          item.command.fromY === shiftFrom?.y &&
          item.command.toX === x &&
          item.command.toY === y,
      );
    }
    if (view.phase === "move" && shiftMode) {
      return view.legalActions.some(
        (item) => item.command.type === "shiftTile" && item.command.fromX === x && item.command.fromY === y,
      );
    }
    if (view.phase === "move") {
      return view.legalActions.some((item) => item.command.type === "moveSelf" && item.command.x === x && item.command.y === y);
    }
    if (view.phase !== "action" || !selected) return false;
    return view.legalActions.some((item) => {
      if (item.command.type !== "placeTile") return false;
      if (item.command.instanceId !== selected || item.command.x !== x || item.command.y !== y) return false;
      return focusId ? item.command.focusId === focusId : !item.command.focusId;
    });
  };

  paint();
}

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    if (char === "&") return "&amp;";
    if (char === "<") return "&lt;";
    if (char === ">") return "&gt;";
    if (char === '"') return "&quot;";
    return "&#39;";
  });
}
