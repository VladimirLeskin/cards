import { createEngine, SetupError } from "@deckforge/engine";
import type { CardView, ClientView, Command, GameModule, HeroDefinition, LegalAction, Match } from "@deckforge/engine";
import { captureFlights, flightPlans, keepFlights, launchFlights, visibleCardIds } from "./flight";
import type { FlightSnapshot } from "./flight";
import { actionHint, actionMark, setupHint } from "./hints";

export interface TableTheme {
  felt: string;
  ink: string;
  accent: string;
  danger: string;
  paper: string;
}

interface SeatDraft {
  name: string;
  heroId: string;
  controller: "human" | "ai";
}

function assetUrl(src: string): string {
  if (/^(?:https?:|data:|\/)/.test(src)) return src;
  const base = import.meta.env.BASE_URL || "/";
  return `${base.endsWith("/") ? base : `${base}/`}${src}`;
}

const reasons: Record<string, string> = {
  "all-locations-cleared": "Все локации пройдены",
  "locations-overrun": "Локации захвачены",
  "event-deck-empty": "Колода событий закончилась",
  "all-stunned": "Все герои оглушены",
  "turn-limit": "Закончились ходы",
  "resolution-limit": "Слишком длинная цепочка эффектов",
  "loop-guard": "Партия остановлена защитой от зацикливания",
  "ai-stuck": "Компьютер не смог выбрать ход",
};

export function mountGame(root: HTMLElement, options: { module: GameModule; theme: TableTheme }): void {
  const { module, theme } = options;
  const engine = createEngine([module]);
  const config = module.config;
  let seats: SeatDraft[] = [
    { name: "Игрок", heroId: config.heroes[0]?.id ?? "", controller: "human" },
  ];
  let match: Match | null = null;
  let error = "";
  let flights: FlightSnapshot[] = [];

  const paint = () => {
    const landing = flights;
    flights = [];
    root.replaceChildren();
    root.style.setProperty("--felt", theme.felt);
    root.style.setProperty("--ink", theme.ink);
    root.style.setProperty("--accent", theme.accent);
    root.style.setProperty("--danger", theme.danger);
    root.style.setProperty("--paper", theme.paper);
    if (!match) renderSetup();
    else renderMatch(match.view(), landing);
    launchFlights(root, landing);
  };

  const submit = (command: Command) => {
    if (!match) return;
    const played = [...root.querySelectorAll<HTMLElement>("[data-zone=play] [data-card-id]")]
      .map((card) => card.dataset.cardId)
      .filter((id): id is string => Boolean(id));
    const planned = flightPlans(command, config.mechanics.buyDestination, played);
    const captured = captureFlights(root, planned);
    const result = match.submit(command);
    error = result.ok ? "" : (result.error ?? "Ход отклонён");
    const visible = visibleCardIds(match.view());
    const kept = new Set(keepFlights(planned, visible).map((flight) => flight.instanceId));
    flights = result.ok ? captured.filter((flight) => kept.has(flight.instanceId)) : [];
    for (const flight of captured) {
      if (!flights.includes(flight)) flight.flyer.remove();
    }
    paint();
  };

  const renderSetup = () => {
    const screen = el("section", "setup");
    screen.append(el("h1", undefined, config.title), el("p", "lede", config.description));
    screen.append(hintBar(setupHint(seats.length, config.playerCount)));
    if (error) screen.append(el("p", "error", error));

    for (const [index, seat] of seats.entries()) {
      const row = el("div", "seat");
      row.dataset.seat = String(index);
      row.append(
        field("Имя", input(seat.name, "name")),
        field(
          "Герой",
          heroSelect(
            config.heroes,
            seat.heroId,
            new Set(seats.filter((_, other) => other !== index).map((other) => other.heroId)),
          ),
        ),
        field("Кто ходит", controllerSelect(seat.controller)),
      );
      screen.append(row);
    }

    const actions = el("div", "setup-actions");
    if (seats.length < config.playerCount.max) {
      const add = button("Добавить игрока", "is-legal");
      add.dataset.testid = "add-seat";
      add.addEventListener("click", () => {
        seats = readSeats(root);
        const taken = new Set(seats.map((seat) => seat.heroId));
        const hero = config.heroes.find((item) => !taken.has(item.id)) ?? config.heroes[0];
        seats.push({
          name: hero?.name ?? `Игрок ${seats.length + 1}`,
          heroId: hero?.id ?? "",
          controller: "ai",
        });
        paint();
      });
      actions.append(add);
    }
    if (seats.length > config.playerCount.min) {
      const remove = button("Убрать игрока", "is-legal");
      remove.addEventListener("click", () => {
        seats = readSeats(root).slice(0, -1);
        paint();
      });
      actions.append(remove);
    }
    const start = button("Начать партию", "primary is-legal");
    start.dataset.testid = "start-match";
    start.addEventListener("click", () => {
      seats = readSeats(root);
      try {
        match = engine.createMatch({
          gameId: config.id,
          seed: Math.floor(Math.random() * 1_000_000_000) + 1,
          players: seats.map((seat) => ({
            name: seat.name,
            controller: seat.controller,
            heroId: seat.heroId,
          })),
        });
        error = "";
      } catch (caught) {
        error = caught instanceof SetupError ? caught.message : "Не удалось начать партию";
      }
      paint();
    });
    actions.append(start);
    screen.append(actions);
    root.append(screen);
  };

  const renderMatch = (view: ClientView, landing: FlightSnapshot[]) => {
    const arriving = new Set(landing.filter((flight) => flight.zone !== "discard").map((flight) => flight.instanceId));
    const landingDiscard = new Set(landing.filter((flight) => flight.zone === "discard").map((flight) => flight.playerId));
    const screen = el("section", "match");
    const active = view.players.find((player) => player.id === view.activePlayerId);
    const top = el("header", "topbar");
    const titles = el("div");
    titles.append(el("h1", undefined, view.title));
    titles.append(el("p", "muted", `Ход ${view.turn} · ${phaseLabel(view.phase.id)} · ходит ${active?.name ?? "—"}`));
    const again = button("Новая партия");
    again.dataset.testid = "new-match";
    again.addEventListener("click", () => {
      match = null;
      error = "";
      paint();
    });
    top.append(titles, again);
    screen.append(top);
    if (!view.outcome) {
      const hint = actionHint(view.legalActions);
      if (hint) screen.append(hintBar(hint));
    }
    if (error) screen.append(el("p", "error", error));
    if (view.outcome) {
      const banner = el("section", "panel outcome");
      banner.dataset.testid = "outcome";
      banner.append(
        el("h2", undefined, view.outcome.result === "won" ? "Победа" : "Поражение"),
        el("p", undefined, reasons[view.outcome.reason] ?? view.outcome.reason),
      );
      screen.append(banner);
    }

    const layout = el("div", "layout");
    layout.append(renderPlayers(view, submit, landingDiscard), renderBoard(view, submit), renderLog(view, submit));
    screen.append(layout);

    const activePlayer = active;
    if (activePlayer) {
      const played = el("section", "panel");
      played.append(el("h2", undefined, "В игре"));
      const row = el("div", "row");
      row.dataset.zone = "play";
      row.dataset.playerId = activePlayer.id;
      row.dataset.testid = "in-play";
      for (const card of activePlayer.play) {
        const face = cardFace(card);
        if (arriving.has(card.instanceId)) face.classList.add("is-arriving");
        row.append(face);
      }
      if (activePlayer.play.length === 0) {
        row.append(el("p", "muted drop-hint", "Сыгранные карты остаются здесь до конца хода"));
      }
      played.append(row);
      screen.append(played);
    }
    if (activePlayer && Array.isArray(activePlayer.hand)) {
      const zone = el("section", "panel");
      zone.append(el("h2", undefined, `Рука: ${activePlayer.name}`));
      const hand = el("div", "hand");
      hand.dataset.testid = "hand";
      hand.dataset.zone = "hand";
      for (const card of activePlayer.hand) {
        const face = cardFace(card, findPlay(view.legalActions, card.instanceId), submit);
        if (arriving.has(card.instanceId)) face.classList.add("is-arriving");
        hand.append(face);
      }
      if (activePlayer.hand.length === 0) hand.append(el("p", "muted", "Рука пуста"));
      zone.append(hand);
      screen.append(zone);
    }

    if (view.pending) {
      const modal = el("div", "modal");
      const box = el("section", "panel");
      box.append(el("h2", undefined, view.pending.prompt));
      const choices = el("div", "toolbar");
      for (const option of view.pending.options) {
        const choice = button(option.label, "primary is-legal");
        choice.dataset.testid = "choice";
        choice.dataset.legal = "choose";
        choice.addEventListener("click", () => {
          submit({ type: "choose", playerId: view.pending!.playerId, optionId: option.id });
        });
        choices.append(choice);
      }
      box.append(choices);
      modal.append(box);
      screen.append(modal);
    }

    root.append(screen);
  };

  paint();
}

function renderPlayers(
  view: ClientView,
  submit: (command: Command) => void,
  landingDiscard: Set<string>,
): HTMLElement {
  const panel = el("aside", "panel");
  panel.append(el("h2", undefined, "Герои"));
  for (const player of view.players) {
    const heal = view.legalActions.find(
      (action) => action.command.type === "assignHeal" && action.command.targetPlayerId === player.id,
    );
    const card = el(heal ? "button" : "article", `player${player.id === view.activePlayerId ? " is-active" : ""}${heal ? " is-legal" : ""}`);
    if (heal && card instanceof HTMLButtonElement) {
      card.type = "button";
      markLegal(card, heal);
      card.addEventListener("click", () => submit(heal.command));
    }
    card.append(el("strong", undefined, `${player.name} · ${player.heroName}`));
    card.append(el("span", "muted", `${player.controller === "ai" ? "Компьютер" : "Человек"}${player.stunned ? " · оглушён" : ""}`));
    const bar = el("div", "health");
    const fill = el("span");
    fill.style.width = `${Math.round((player.health / player.maxHealth) * 100)}%`;
    bar.append(fill);
    card.append(bar, el("span", undefined, `${player.health}/${player.maxHealth}`));
    const pools = view.resources
      .map((resource) => `${resource.name} ${player.pools[resource.id] ?? 0}`)
      .join(" · ");
    card.append(el("span", "meta", pools));
    const piles = el("div", "piles");
    piles.append(el("span", "pile", `Колода ${player.deckCount}`));
    const discard = el("span", `pile${landingDiscard.has(player.id) ? " is-landing" : ""}`, `Сброс ${player.discard.length}`);
    discard.dataset.zone = "discard";
    discard.dataset.playerId = player.id;
    piles.append(discard);
    card.append(piles);
    panel.append(card);
  }
  return panel;
}

function renderBoard(view: ClientView, submit: (command: Command) => void): HTMLElement {
  const panel = el("main", "panel");
  const locationAttack = view.legalActions.find(
    (action) => action.command.type === "assignAttack" && action.command.target.type === "location",
  );
  panel.append(zoneTitle("Локация", view.locationsRemaining > 0 ? `ещё ${view.locationsRemaining}` : "последняя"));
  if (view.location) panel.append(cardFace(view.location, locationAttack, submit, "location"));
  else panel.append(el("p", "muted", "Локации нет"));

  panel.append(zoneTitle("Враги", `в колоде ${view.enemyDeckCount}`));
  const enemies = el("div", "row");
  enemies.dataset.testid = "enemies";
  for (const enemy of view.enemies) {
    const attack = view.legalActions.find(
      (action) =>
        action.command.type === "assignAttack" &&
        action.command.target.type === "enemy" &&
        action.command.target.instanceId === enemy.instanceId,
    );
    enemies.append(cardFace(enemy, attack, submit));
  }
  if (view.enemies.length === 0) enemies.append(el("p", "muted", "Поле чисто"));
  panel.append(enemies);

  if (view.eventsRevealed.length > 0) {
    panel.append(zoneTitle("События хода", `в колоде ${view.eventDeckCount}`));
    const events = el("div", "row");
    for (const event of view.eventsRevealed) events.append(cardFace(event));
    panel.append(events);
  }

  panel.append(zoneTitle("Рынок", `в колоде ${view.marketDeckCount}`));
  const market = el("div", "row");
  market.dataset.testid = "market";
  for (const card of view.market) {
    if (!card) continue;
    const buy = view.legalActions.find(
      (action) => action.command.type === "buyCard" && action.command.instanceId === card.instanceId,
    );
    market.append(cardFace(card, buy, submit));
  }
  panel.append(market);
  return panel;
}

function renderLog(view: ClientView, submit: (command: Command) => void): HTMLElement {
  const panel = el("aside", "panel");
  panel.append(el("h2", undefined, "Ход"));
  const tools = el("div", "toolbar");
  for (const action of view.legalActions) {
    if (!isTool(action)) continue;
    const control = button(action.label, action.command.type === "endTurn" ? "primary is-legal" : "is-legal");
    if (action.command.type === "endTurn") control.dataset.testid = "end-turn";
    control.dataset.legal = action.command.type;
    control.addEventListener("click", () => submit(action.command));
    tools.append(control);
  }
  if (tools.childElementCount > 0) panel.append(tools);
  const log = el("ol", "log");
  log.dataset.testid = "log";
  for (const event of view.log.slice(-16)) log.append(el("li", undefined, event.message));
  panel.append(log);
  return panel;
}

function cardFace(
  card: CardView,
  action?: LegalAction,
  submit?: (command: Command) => void,
  testId?: string,
): HTMLElement {
  const node = el(action ? "button" : "article", `card${action ? " is-legal" : ""}`);
  if (testId) node.dataset.testid = testId;
  node.dataset.cardId = card.instanceId;
  if (node instanceof HTMLButtonElement) {
    node.type = "button";
    if (action && submit) {
      markLegal(node, action);
      node.addEventListener("click", () => submit(action.command));
    }
  }
  const image = document.createElement("img");
  image.alt = "";
  image.src = assetUrl(card.image);
  const title = el("h3", undefined, card.name);
  const bits = [
    card.cost != null ? `цена ${card.cost}` : "",
    card.remainingHealth != null ? `жизнь ${card.remainingHealth}/${card.health}` : "",
    card.attack != null ? `атака ${card.attack}` : "",
  ].filter(Boolean);
  node.append(image, title);
  if (bits.length > 0) node.append(el("div", "meta", bits.join(" · ")));
  node.append(el("p", undefined, card.text));
  return node;
}

function hintBar(text: string): HTMLElement {
  const bar = el("p", "hint-bar", text);
  bar.dataset.testid = "action-hint";
  bar.setAttribute("role", "status");
  return bar;
}

function markLegal(node: HTMLElement, action: LegalAction): void {
  node.dataset.legal = action.command.type;
  node.title = action.label;
  node.setAttribute("aria-label", action.label);
  const mark = actionMark(action.command);
  if (mark) node.append(el("span", "hint-mark", mark));
}

function findPlay(actions: LegalAction[], instanceId: string): LegalAction | undefined {
  return actions.find((action) => action.command.type === "playCard" && action.command.instanceId === instanceId);
}

function isTool(action: LegalAction): boolean {
  return ["endTurn", "activateAbility", "rollDie", "spendToken", "useProp"].includes(action.command.type);
}

function phaseLabel(phase: ClientView["phase"]["id"]): string {
  if (phase === "threat") return "угроза";
  if (phase === "cleanup") return "завершение";
  return "действия";
}

function zoneTitle(title: string, note: string): HTMLElement {
  const head = el("div", "zone-head");
  head.append(el("h2", undefined, title), el("span", "muted", note));
  return head;
}

function heroSelect(heroes: HeroDefinition[], selected: string, taken: Set<string>): HTMLSelectElement {
  const select = document.createElement("select");
  select.dataset.field = "hero";
  for (const hero of heroes) {
    const option = document.createElement("option");
    option.value = hero.id;
    option.textContent = hero.name;
    option.selected = hero.id === selected;
    option.disabled = taken.has(hero.id);
    select.append(option);
  }
  return select;
}

function controllerSelect(selected: SeatDraft["controller"]): HTMLSelectElement {
  const select = document.createElement("select");
  select.dataset.field = "controller";
  for (const [value, label] of [["human", "Человек"], ["ai", "Компьютер"]] as const) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    option.selected = value === selected;
    select.append(option);
  }
  return select;
}

function field(label: string, control: HTMLElement): HTMLLabelElement {
  const wrap = el("label", "field");
  wrap.append(el("span", undefined, label), control);
  return wrap;
}

function input(value: string, fieldName: string): HTMLInputElement {
  const node = document.createElement("input");
  node.value = value;
  node.dataset.field = fieldName;
  node.maxLength = 24;
  return node;
}

function readSeats(root: HTMLElement): SeatDraft[] {
  return [...root.querySelectorAll<HTMLElement>("[data-seat]")].map((row) => ({
    name: row.querySelector<HTMLInputElement>("[data-field=name]")?.value.trim() || "Игрок",
    heroId: row.querySelector<HTMLSelectElement>("[data-field=hero]")?.value ?? "",
    controller: row.querySelector<HTMLSelectElement>("[data-field=controller]")?.value === "ai" ? "ai" : "human",
  }));
}

function button(label: string, className?: string): HTMLButtonElement {
  const node = el("button", className, label);
  node.type = "button";
  return node;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}
