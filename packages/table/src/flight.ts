import type { ClientView, Command } from "@deckforge/engine";

export type CardZone = "play" | "discard" | "hand";

export interface PlannedFlight {
  instanceId: string;
  playerId: string;
  zone: CardZone;
}

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function flightPlans(
  command: Command,
  buyDestination: "discard" | "hand",
  playedIds: string[] = [],
): PlannedFlight[] {
  if (command.type === "playCard") {
    return [{ instanceId: command.instanceId, playerId: command.playerId, zone: "play" }];
  }
  if (command.type === "buyCard") {
    return [{ instanceId: command.instanceId, playerId: command.playerId, zone: buyDestination }];
  }
  if (command.type === "choose") {
    return [{ instanceId: command.optionId, playerId: command.playerId, zone: "discard" }];
  }
  if (command.type === "endTurn") {
    return playedIds.map((instanceId) => ({ instanceId, playerId: command.playerId, zone: "discard" }));
  }
  return [];
}

/** Cards the table actually draws. A discard pile is only a counter, so those ids stay out. */
export function visibleCardIds(view: ClientView): Set<string> {
  const ids = new Set<string>();
  const add = (card: { instanceId: string } | null | undefined) => {
    if (card) ids.add(card.instanceId);
  };
  for (const player of view.players) {
    if (Array.isArray(player.hand)) {
      for (const card of player.hand) add(card);
    }
    for (const card of player.play) add(card);
  }
  for (const card of view.market) add(card);
  for (const card of view.enemies) add(card);
  add(view.location);
  for (const card of view.eventsRevealed) add(card);
  return ids;
}

/** Drop a discard flight when the card is still on the table, for example an attack choice. */
export function keepFlights(flights: PlannedFlight[], visible: Set<string>): PlannedFlight[] {
  return flights.filter((flight) => flight.zone !== "discard" || !visible.has(flight.instanceId));
}

export function flightDelta(from: Box, to: Box): { x: number; y: number; scale: number } {
  const scale = from.width === 0 ? 1 : Math.min(1, to.width / from.width);
  return {
    x: to.left + to.width / 2 - (from.left + from.width / 2),
    y: to.top + to.height / 2 - (from.top + from.height / 2),
    scale,
  };
}

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export interface FlightSnapshot extends PlannedFlight {
  rect: Box;
  flyer: HTMLElement;
}

export function captureFlights(root: ParentNode, flights: PlannedFlight[]): FlightSnapshot[] {
  if (prefersReducedMotion()) return [];
  const snapshots: FlightSnapshot[] = [];
  for (const flight of flights) {
    const source = root.querySelector<HTMLElement>(`[data-card-id="${cssEscape(flight.instanceId)}"]`);
    if (!source) continue;
    const rect = source.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    snapshots.push({ ...flight, rect, flyer: makeFlyer(source, rect) });
  }
  return snapshots;
}

export function launchFlights(root: ParentNode, flights: FlightSnapshot[]): void {
  for (const flight of flights) {
    const destination = root.querySelector<HTMLElement>(destinationSelector(flight));
    if (!destination) {
      flight.flyer.remove();
      continue;
    }
    document.body.append(flight.flyer);
    const scrollBefore = window.scrollY;
    destination.scrollIntoView({ block: "nearest", inline: "nearest" });
    const scrolled = window.scrollY - scrollBefore;
    const from = { ...flight.rect, top: flight.rect.top - scrolled };
    if (scrolled !== 0) flight.flyer.style.top = `${from.top}px`;
    const to = destination.getBoundingClientRect();
    const delta = flightDelta(from, to);
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      flight.flyer.remove();
      destination.classList.remove("is-arriving", "is-landing");
      destination.classList.add("is-landed");
    };
    flight.flyer.addEventListener("transitionend", finish, { once: true });
    window.setTimeout(finish, 700);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (settled) return;
        flight.flyer.style.transform = `translate(${delta.x}px, ${delta.y}px) scale(${delta.scale})`;
      });
    });
  }
}

function destinationSelector(flight: PlannedFlight): string {
  if (flight.zone === "discard") {
    return `[data-zone="discard"][data-player-id="${cssEscape(flight.playerId)}"]`;
  }
  return `[data-zone="${flight.zone}"] [data-card-id="${cssEscape(flight.instanceId)}"]`;
}

function makeFlyer(source: HTMLElement, rect: DOMRect): HTMLElement {
  const flyer = source.cloneNode(true) as HTMLElement;
  flyer.classList.remove("is-legal");
  flyer.classList.add("card-flyer");
  flyer.setAttribute("aria-hidden", "true");
  for (const mark of flyer.querySelectorAll(".hint-mark")) mark.remove();
  if (flyer instanceof HTMLButtonElement) flyer.disabled = true;
  flyer.style.left = `${rect.left}px`;
  flyer.style.top = `${rect.top}px`;
  flyer.style.width = `${rect.width}px`;
  flyer.style.height = `${rect.height}px`;
  return flyer;
}

function cssEscape(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(value);
  return value.replace(/[^a-zA-Z0-9_-]/g, (char) => `\\${char}`);
}
