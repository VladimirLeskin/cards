import type { Controller, ParkCardView, ParkCommand, ParkConfig, ParkMatch, ParkView } from "@deckforge/engine";
import { ParkMatch as Match } from "@deckforge/engine";
import { planMotion, type MotionPlan, type MotionSnap } from "./motion";

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
  let recentDiscard: ParkCardView | null = null;
  let last: Held | null = null;
  let banner: BannerBlock[] = [];
  let bannerTimer = 0;
  const known = new Map<string, ParkCardView>();

  const paint = () => {
    clearFlyers();
    if (!match) {
      last = null;
      recentDiscard = null;
      known.clear();
      banner = [];
      window.clearTimeout(bannerTimer);
      root.innerHTML = setupHtml();
      bind();
      return;
    }
    const view = match.view();
    const snap = readSnap(view);
    const motion = planMotion(last?.snap ?? null, snap);
    const opening = last === null;
    const discardedNow = motion.discarded
      .map((id) => known.get(id))
      .filter((card): card is ParkCardView => Boolean(card));
    if (discardedNow.length > 0) recentDiscard = discardedNow[discardedNow.length - 1] ?? null;
    const hidden = new Set([...motion.incoming, ...motion.placed, ...motion.shifted]);
    const hiddenTokens = new Set(motion.walked);
    const freshLogs = new Set(
      last ? view.log.filter((entry) => !last?.snap.log.some((item) => item.id === entry.id)).map((entry) => entry.id) : [],
    );
    remember(view, known);
    const blocks = announcements(view, motion, known, opening);
    if (blocks.length > 0) holdBanner(blocks);
    const freshReaction = blocks.find((block) => block.reaction)?.reaction?.name ?? null;
    root.innerHTML = matchHtml(view, hidden, hiddenTokens, motion, freshLogs, freshReaction);
    bind();
    runFlights(root, last, motion, known, opening);
    last = {
      snap,
      boxes: readBoxes(root),
      deck: measure(root.querySelector("[data-testid=tile-deck]")),
      discard: measure(root.querySelector("[data-testid=tile-discard]")),
      tokens: readTokens(root),
    };
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

  const matchHtml = (
    view: ParkView,
    hidden: Set<string>,
    hiddenTokens: Set<string>,
    motion: MotionPlan,
    freshLogs: Set<number>,
    freshReaction: string | null,
  ) => {
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
        const mark = legal ? cellMark(view) : "";
        const here = cell.players.some((player) => player.id === view.activePlayerId);
        const tile = cell.tile;
        const arrived = tile && hidden.has(tile.instanceId) ? "is-incoming" : "";
        const risen = tile && motion.risen.includes(tile.instanceId) ? "is-new" : "";
        const peopleHtml = cell.players
          .map((player) => {
            const info = view.players.find((item) => item.id === player.id);
            const moving = hiddenTokens.has(player.id) ? "is-incoming" : "";
            return `<span class="token player ${moving}" data-token="${esc(player.id)}" title="${esc(player.name)}">${info ? `<img src="${esc(info.image)}" alt="" />` : ""}${esc(player.name.slice(0, 1))}</span>`;
          })
          .join("");
        const diseaseHtml = cell.diseases
          .map((disease) => {
            const born = motion.spawned.includes(disease.id) ? "is-new" : "";
            const picture = config.diseases.find((item) => item.name === disease.name)?.image;
            const face = picture ? `<img src="${esc(picture)}" alt="" />` : esc(disease.name.slice(0, 1));
            return `<span class="token disease ${born}" data-disease="${esc(disease.id)}" title="${esc(disease.name)}">${face}</span>`;
          })
          .join("");
        const body = tile
          ? `<img src="${esc(tile.image)}" alt="" /><span class="cell-name">${esc(tile.name)}</span>${mark ? `<span class="cell-mark">${esc(mark)}</span>` : `<span class="cell-kind">${esc(kindLabel[tile.kind] ?? tile.kind)} · ${esc(vpLabel(tile.vp))}</span>`}`
          : `<span class="empty">${esc(mark)}</span>`;
        const tip = tile ? `${tile.name}. ${tile.text}` : mark;
        return `<button type="button" class="cell ${tile ? `kind-${tile.kind}` : "blank"} ${legal ? "is-legal" : ""} ${shifting ? "is-shift" : ""} ${here ? "is-hero" : ""} ${arrived} ${risen}" style="grid-column:${cell.x - minX + 1};grid-row:${cell.y - minY + 1}" data-testid="cell" data-act="cell" data-x="${cell.x}" data-y="${cell.y}" data-legal="${legal ? "true" : "false"}" ${tile ? `data-instance="${esc(tile.instanceId)}"` : ""} title="${esc(tip)}">${body}<span class="tokens">${peopleHtml}${diseaseHtml}</span></button>`;
      })
      .join("");
    const discarding = view.phase === "start" || view.phase === "trim" || view.phase === "reaction";
    const hand = view.hand
      .map((card) => {
        const picked = card.instanceId === selected || card.instanceId === focusId;
        const pickable = view.phase === "action" ? "is-pickable" : "";
        const arriving = hidden.has(card.instanceId) ? "is-incoming" : "";
        const swatch = card.color ? `<i class="swatch swatch-${card.color}"></i>` : "";
        return `<div class="card ${picked ? "is-selected" : ""} ${pickable} ${arriving} kind-${card.kind}" data-testid="hand-card" data-instance="${esc(card.instanceId)}">
          <button type="button" class="pick" data-act="pick" data-instance="${esc(card.instanceId)}" data-kind="${card.kind}">
            <img src="${esc(card.image)}" alt="" />
            <span class="card-copy">
              <span class="card-name">${esc(card.name)}</span>
              <span class="card-meta">${picked ? "выбран · " : ""}${swatch}${esc(kindLabel[card.kind] ?? card.kind)} · ${esc(vpLabel(card.vp))}</span>
              <span class="card-text" data-testid="card-text">${esc(card.text)}</span>
            </span>
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
          `<div class="score ${player.id === view.activePlayerId ? "is-active" : ""} ${player.exited ? "is-out" : ""} ${motion.vpChanged.includes(player.id) ? "is-pop" : ""}" data-testid="player">
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
      ${bannerHtml(freshReaction)}
      <div class="layout">
        <div class="board-wrap">
          <div class="board" data-testid="board" style="grid-template-columns:repeat(${cols}, 128px);grid-template-rows:repeat(${rows}, 158px)">${cells}</div>
        </div>
        <aside>
          <div class="scores">${scores}</div>
          <p class="meta">Приступы: ${view.hearts}${view.closingLeft != null ? `. До закрытия ходов: ${view.closingLeft}` : ""}</p>
          <div class="toolbar" data-testid="toolbar">${tools}</div>
          <div class="piles">
            <div class="pile" data-testid="tile-deck"><div class="pile-face"><b>${view.tileDeckCount}</b><span>колода</span></div></div>
            <div class="pile is-discard ${motion.discarded.length > 0 ? "is-incoming" : ""}" data-testid="tile-discard">${recentDiscard ? `<img src="${esc(recentDiscard.image)}" alt="" /><span class="pile-caption">${esc(recentDiscard.name)}</span>` : `<div class="pile-face pile-empty"><b>—</b><span>сброс</span></div>`}</div>
            <div class="pile is-reaction" data-testid="reaction-deck"><div class="pile-face"><b>${view.reactionDeckCount}</b><span>реакции</span></div></div>
          </div>
          <p class="pile-help">Колода закрыта. В руке написано, что делает тайл. На поле он даёт очки.</p>
          <ol class="log" data-testid="log">${view.log.map((entry) => `<li class="${freshLogs.has(entry.id) ? "is-fresh" : ""}">${esc(entry.message)}</li>`).join("")}</ol>
        </aside>
        <div class="hand-dock">
          <p class="hand-hint" data-testid="hint">${esc(stepText(view))}</p>
          <div class="hand" data-testid="hand">${hand || `<p class="muted">Рука пуста</p>`}</div>
        </div>
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

  const holdBanner = (blocks: BannerBlock[]) => {
    banner = blocks;
    window.clearTimeout(bannerTimer);
    bannerTimer = window.setTimeout(() => {
      banner = [];
      root.querySelector("[data-testid=toasts]")?.remove();
    }, 7200);
  };

  const bannerHtml = (freshReaction: string | null) => {
    if (banner.length === 0) return "";
    const blocks = banner
      .map((block) => {
        const items = block.items.map((item) => `<li>${esc(item)}</li>`).join("");
        const reaction = block.reaction;
        const arriving = reaction && reaction.name === freshReaction ? "is-incoming" : "";
        const card = reaction
          ? `<div class="reaction-card ${arriving}" data-testid="reaction-card">
              <img src="${esc(reaction.image)}" alt="" />
              <div><strong>${esc(reaction.name)}</strong><span>${esc(reaction.text)}</span></div>
            </div>`
          : "";
        return `<div class="banner-block"><p>${esc(block.title)}</p>${items ? `<ul>${items}</ul>` : ""}${card}</div>`;
      })
      .join("");
    return `<div class="banner" data-testid="toasts" aria-live="polite">${blocks}</div>`;
  };

  const announcements = (view: ParkView, motion: MotionPlan, cards: Map<string, ParkCardView>, opening: boolean): BannerBlock[] => {
    const blocks: BannerBlock[] = [];
    const named = (ids: string[]) =>
      ids.map((id) => cards.get(id)).filter((card): card is ParkCardView => Boolean(card));
    if (motion.seatChanged) {
      const player = view.players.find((item) => item.id === view.activePlayerId);
      blocks.push({
        title: player ? `Рука ${player.name}` : "Рука",
        items: view.hand.map((card) => shortCard(card)),
      });
    }
    const incoming = named(motion.incoming);
    if (incoming.length > 0) {
      blocks.push({
        title: opening ? "Стартовая рука из колоды" : "Из колоды",
        items: incoming.map((card) => shortCard(card)),
      });
    }
    const discarded = named(motion.discarded);
    if (discarded.length > 0) blocks.push({ title: "В сброс", items: discarded.map((card) => shortCard(card)) });
    for (const message of motion.notes) {
      const reactionName = message.startsWith("Реакция тела: ") ? message.slice("Реакция тела: ".length) : "";
      const reaction = reactionName ? config.reactions.find((item) => item.name === reactionName) : undefined;
      blocks.push(
        reaction
          ? { title: "Из колоды реакций", items: [], reaction: { name: reaction.name, text: reaction.text, image: reaction.image } }
          : { title: message, items: [] },
      );
    }
    return blocks.slice(0, 4);
  };

  paint();
}

function remember(view: ParkView, known: Map<string, ParkCardView>): void {
  for (const card of view.hand) known.set(card.instanceId, card);
  for (const cell of view.cells) {
    if (cell.tile) known.set(cell.tile.instanceId, cell.tile);
  }
}

function readSnap(view: ParkView): MotionSnap {
  const ground: Record<string, string> = {};
  for (const cell of view.cells) {
    if (cell.tile) ground[cell.tile.instanceId] = `${cell.x},${cell.y}`;
  }
  const places: Record<string, string> = {};
  const vp: Record<string, number> = {};
  for (const player of view.players) {
    places[player.id] = `${player.x},${player.y}`;
    vp[player.id] = player.vp;
  }
  return {
    hand: view.hand.map((card) => card.instanceId),
    ground,
    log: view.log,
    diseases: view.cells.flatMap((cell) => cell.diseases.map((disease) => disease.id)),
    places,
    vp,
    seat: view.activePlayerId,
  };
}

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface Held {
  snap: MotionSnap;
  boxes: Map<string, Box>;
  deck: Box | null;
  discard: Box | null;
  tokens: Map<string, Box>;
}

interface BannerBlock {
  title: string;
  items: string[];
  reaction?: { name: string; text: string; image: string };
}

interface Face {
  image: string;
  name: string;
  caption: string;
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

function vpLabel(vp: number): string {
  if (vp <= 0) return "без очков";
  const mod10 = vp % 10;
  const mod100 = vp % 100;
  const word =
    mod10 === 1 && mod100 !== 11 ? "очко" : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? "очка" : "очков";
  return `${vp} ${word}`;
}

const colorWord: Record<string, [string, string]> = {
  red: ["красный", "красная"],
  blue: ["синий", "синяя"],
  brown: ["коричневый", "коричневая"],
  green: ["зелёный", "зелёная"],
  yellow: ["жёлтый", "жёлтая"],
};

function shortCard(card: ParkCardView): string {
  const female = card.kind === "food" || card.kind === "ride";
  const pair = card.color ? colorWord[card.color] : undefined;
  const color = pair ? `${female ? pair[1] : pair[0]} ` : "";
  return `«${card.name}» — ${color}${kindLabel[card.kind] ?? card.kind}, ${vpLabel(card.vp)}`;
}

function clearFlyers(): void {
  document.querySelectorAll(".tile-flyer").forEach((node) => node.remove());
}

function faceOf(card: ParkCardView): Face {
  return {
    image: card.image,
    name: card.name,
    caption: `${kindLabel[card.kind] ?? card.kind} · ${vpLabel(card.vp)}. ${card.text}`,
  };
}

function measure(node: Element | null): Box | null {
  if (!(node instanceof HTMLElement)) return null;
  const rect = node.getBoundingClientRect();
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

function readBoxes(root: HTMLElement): Map<string, Box> {
  const boxes = new Map<string, Box>();
  root.querySelectorAll<HTMLElement>(".card[data-instance], .cell[data-instance]").forEach((node) => {
    const id = node.dataset.instance;
    const box = measure(node);
    if (id && box) boxes.set(id, box);
  });
  return boxes;
}

function readTokens(root: HTMLElement): Map<string, Box> {
  const boxes = new Map<string, Box>();
  root.querySelectorAll<HTMLElement>("[data-token]").forEach((node) => {
    const id = node.dataset.token;
    const box = measure(node);
    if (id && box) boxes.set(id, box);
  });
  return boxes;
}

function reveal(node: HTMLElement): void {
  const scroller = node.closest(".board-wrap, .hand");
  if (!(scroller instanceof HTMLElement)) return;
  const item = node.getBoundingClientRect();
  const frame = scroller.getBoundingClientRect();
  if (item.top < frame.top) scroller.scrollTop -= frame.top - item.top + 8;
  else if (item.bottom > frame.bottom) scroller.scrollTop += item.bottom - frame.bottom + 8;
  if (item.left < frame.left) scroller.scrollLeft -= frame.left - item.left + 8;
  else if (item.right > frame.right) scroller.scrollLeft += item.right - frame.right + 8;
}

function fly(from: Box, to: Box, face: Face, delay: number, done?: () => void): void {
  const flyer = document.createElement("div");
  flyer.className = "tile-flyer";
  flyer.innerHTML = `<img src="${esc(face.image)}" alt=""><strong>${esc(face.name)}</strong><small>${esc(face.caption)}</small>`;
  const width = 168;
  const height = 228;
  const fromX = from.left + from.width / 2;
  const fromY = from.top + from.height / 2;
  const toX = to.left + to.width / 2;
  const toY = to.top + to.height / 2;
  flyer.style.left = `${toX - width / 2}px`;
  flyer.style.top = `${toY - height / 2}px`;
  flyer.style.width = `${width}px`;
  flyer.style.height = `${height}px`;
  document.body.appendChild(flyer);
  const animation = flyer.animate(
    [
      { transform: `translate(${fromX - toX}px, ${fromY - toY}px) scale(0.55)`, opacity: 1 },
      { transform: "translate(0px, 0px) scale(1)", opacity: 1 },
    ],
    { duration: 520, delay, easing: "cubic-bezier(0.22, 0.8, 0.24, 1)", fill: "forwards" },
  );
  animation.finished
    .then(() => {
      done?.();
      flyer.remove();
    })
    .catch(() => flyer.remove());
}

function flyToken(from: Box, to: Box, source: HTMLElement, done?: () => void): void {
  const flyer = source.cloneNode(true) as HTMLElement;
  flyer.classList.remove("is-incoming");
  flyer.classList.add("token-flyer");
  const size = 32;
  const fromX = from.left + from.width / 2;
  const fromY = from.top + from.height / 2;
  const toX = to.left + to.width / 2;
  const toY = to.top + to.height / 2;
  flyer.style.left = `${toX - size / 2}px`;
  flyer.style.top = `${toY - size / 2}px`;
  flyer.style.width = `${size}px`;
  flyer.style.height = `${size}px`;
  document.body.appendChild(flyer);
  const animation = flyer.animate(
    [
      { transform: `translate(${fromX - toX}px, ${fromY - toY}px)`, opacity: 1 },
      { transform: "translate(0px, 0px)", opacity: 1 },
    ],
    { duration: 420, easing: "cubic-bezier(0.22, 0.8, 0.24, 1)", fill: "forwards" },
  );
  animation.finished
    .then(() => {
      done?.();
      flyer.remove();
    })
    .catch(() => flyer.remove());
}

function runFlights(
  root: HTMLElement,
  prev: Held | null,
  motion: MotionPlan,
  known: Map<string, ParkCardView>,
  opening: boolean,
): void {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const revealAll = () => {
    root.querySelectorAll(".is-incoming").forEach((node) => node.classList.remove("is-incoming"));
  };
  if (reduce) {
    revealAll();
    return;
  }
  const deck = measure(root.querySelector("[data-testid=tile-deck]"));
  const discard = measure(root.querySelector("[data-testid=tile-discard]"));
  if (motion.incoming.length > 0) root.querySelector("[data-testid=tile-deck]")?.classList.add("is-hot");
  if (motion.notes.some((line) => line.startsWith("Реакция тела"))) {
    root.querySelector("[data-testid=reaction-deck]")?.classList.add("is-hot");
  }
  let flew = false;
  const gap = opening ? 140 : 90;
  const arrivals: { node: HTMLElement; card: ParkCardView }[] = [];
  for (const id of motion.incoming) {
    const node = root.querySelector<HTMLElement>(`.card[data-instance="${CSS.escape(id)}"]`);
    const card = known.get(id);
    if (!node || !card || !deck) {
      node?.classList.remove("is-incoming");
      continue;
    }
    arrivals.push({ node, card });
  }
  if (arrivals[0]) reveal(arrivals[0].node);
  arrivals.forEach((arrival, index) => {
    const source = deck ?? measure(arrival.node);
    if (!source) {
      arrival.node.classList.remove("is-incoming");
      return;
    }
    flew = true;
    fly(source, measure(arrival.node) ?? source, faceOf(arrival.card), index * gap, () =>
      arrival.node.classList.remove("is-incoming"),
    );
  });
  for (const id of motion.placed) {
    const node = root.querySelector<HTMLElement>(`.cell[data-instance="${CSS.escape(id)}"]`);
    const from = prev?.boxes.get(id);
    const card = known.get(id);
    if (!node || !from || !card) {
      node?.classList.remove("is-incoming");
      continue;
    }
    reveal(node);
    flew = true;
    fly(from, measure(node) ?? from, faceOf(card), 0, () => node.classList.remove("is-incoming"));
  }
  const discardPile = root.querySelector<HTMLElement>("[data-testid=tile-discard]");
  let pendingDiscards = 0;
  for (const id of motion.discarded) {
    const from = prev?.boxes.get(id);
    const card = known.get(id);
    if (!from || !card || !discard) continue;
    pendingDiscards += 1;
    flew = true;
    fly(from, discard, faceOf(card), 0, () => {
      pendingDiscards -= 1;
      if (pendingDiscards === 0) discardPile?.classList.remove("is-incoming");
    });
  }
  if (pendingDiscards === 0) discardPile?.classList.remove("is-incoming");
  for (const id of motion.shifted) {
    const node = root.querySelector<HTMLElement>(`.cell[data-instance="${CSS.escape(id)}"]`);
    const from = prev?.boxes.get(id);
    const card = known.get(id);
    if (!node || !from || !card) {
      node?.classList.remove("is-incoming");
      continue;
    }
    reveal(node);
    flew = true;
    fly(from, measure(node) ?? from, faceOf(card), 0, () => node.classList.remove("is-incoming"));
  }
  const reactionNode = root.querySelector<HTMLElement>("[data-testid=reaction-card].is-incoming");
  const reactionDeck = measure(root.querySelector("[data-testid=reaction-deck]"));
  if (reactionNode && reactionDeck) {
    const image = reactionNode.querySelector("img")?.getAttribute("src") ?? "";
    const name = reactionNode.querySelector("strong")?.textContent ?? "";
    const text = reactionNode.querySelector("span")?.textContent ?? "";
    flew = true;
    fly(reactionDeck, measure(reactionNode) ?? reactionDeck, { image, name, caption: text }, 40, () =>
      reactionNode.classList.remove("is-incoming"),
    );
  } else reactionNode?.classList.remove("is-incoming");
  for (const id of motion.walked) {
    const node = root.querySelector<HTMLElement>(`[data-token="${CSS.escape(id)}"]`);
    const from = prev?.tokens.get(id);
    if (!node || !from) {
      node?.classList.remove("is-incoming");
      continue;
    }
    flew = true;
    flyToken(from, measure(node) ?? from, node, () => node.classList.remove("is-incoming"));
  }
  if (!flew) revealAll();
}
