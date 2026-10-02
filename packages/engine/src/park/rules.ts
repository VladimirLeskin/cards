import { nextInt, rngFromSeed, shuffleInPlace } from "../core/rng";
import { SetupError } from "../core/setup";
import type {
  CreateParkOptions,
  NeighborBonus,
  ParkCommand,
  ParkConfig,
  ParkDisease,
  ParkDiseaseDefinition,
  ParkLegalAction,
  ParkPhase,
  ParkPlayer,
  ParkReactionDefinition,
  ParkState,
  ParkTileDefinition,
  TileKind,
} from "./types";

const dirs = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

export function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

export function createParkState(config: ParkConfig, options: CreateParkOptions): ParkState {
  const count = options.players.length;
  if (count < config.playerCount.min || count > config.playerCount.max) {
    throw new SetupError(`Парку нужно от ${config.playerCount.min} до ${config.playerCount.max} игроков`);
  }
  const seen = new Set<string>();
  for (const player of options.players) {
    if (!player.name.trim()) throw new SetupError("У игрока должно быть имя");
    if (!config.characters.some((character) => character.id === player.characterId)) {
      throw new SetupError(`Неизвестный герой: ${player.characterId}`);
    }
    if (seen.has(player.characterId)) throw new SetupError(`Герой уже занят: ${player.characterId}`);
    seen.add(player.characterId);
  }

  const seed = options.seed ?? Math.floor(Math.random() * 1_000_000_000) + 1;
  const state: ParkState = {
    configId: config.id,
    rng: rngFromSeed(seed),
    seq: 0,
    pieceSeq: 1,
    status: "playing",
    round: 1,
    active: 0,
    turnOrder: [],
    phase: "move",
    reactionThen: "action",
    startNeed: 0,
    players: {},
    pieces: {},
    ground: {},
    diseases: [],
    diseaseSupply: [],
    tileDeck: [],
    tileDiscard: [],
    tileRebuilds: 0,
    reactionDeck: [],
    reactionDiscard: [],
    hearts: 0,
    closingLeft: null,
    log: [],
  };

  const entranceId = mint(state, "entrance");
  state.ground[cellKey(0, 0)] = entranceId;

  options.players.forEach((setup, index) => {
    const id = `p${index + 1}`;
    state.turnOrder.push(id);
    state.players[id] = {
      id,
      name: setup.name.trim(),
      controller: setup.controller,
      characterId: setup.characterId,
      x: 0,
      y: 0,
      exited: false,
      vp: 0,
      hand: [],
    };
  });

  for (const tile of config.tiles) {
    for (let copy = 0; copy < tile.copies; copy += 1) state.tileDeck.push(mint(state, tile.id));
  }
  state.rng = shuffleInPlace(state.tileDeck, state.rng);
  for (const playerId of state.turnOrder) {
    for (let card = 0; card < config.openingHand; card += 1) {
      const drawn = state.tileDeck.pop();
      if (drawn) state.players[playerId]!.hand.push(drawn);
    }
  }

  for (const reaction of config.reactions) {
    for (let copy = 0; copy < reaction.copies; copy += 1) state.reactionDeck.push(reaction.id);
  }
  state.rng = shuffleInPlace(state.reactionDeck, state.rng);
  for (const disease of config.diseases) {
    for (let copy = 0; copy < disease.copies; copy += 1) state.diseaseSupply.push(disease.id);
  }
  state.rng = shuffleInPlace(state.diseaseSupply, state.rng);

  say(state, `Парк открыт. Ходит ${active(state).name}`);
  return state;
}

export function legalPark(state: ParkState, config: ParkConfig, playerId: string): ParkLegalAction[] {
  if (state.status !== "playing" || active(state).id !== playerId) return [];
  const player = state.players[playerId];
  if (!player || player.exited) return [];
  if (state.phase === "start" || state.phase === "trim" || state.phase === "reaction") {
    return player.hand.map((instanceId) => ({
      command: { type: "discardTile", playerId, instanceId },
      label: `Сбросить: ${tileName(state, config, instanceId)}`,
    }));
  }
  if (state.phase === "move") return moveActions(state, config, player);
  return actionActions(state, config, player);
}

export function applyPark(state: ParkState, config: ParkConfig, command: ParkCommand): { ok: boolean; error?: string; state: ParkState } {
  const allowed = legalPark(state, config, command.playerId);
  if (!allowed.some((action) => JSON.stringify(action.command) === JSON.stringify(command))) {
    return { ok: false, error: "Нельзя так сходить", state };
  }
  const next = structuredClone(state);
  enact(next, config, command);
  return { ok: true, state: next };
}

export function placeScore(
  state: ParkState,
  config: ParkConfig,
  definitionId: string,
  x: number,
  y: number,
  focusId?: string,
): number {
  const tile = tileDef(config, definitionId);
  let score = tile.vp;
  const focus = focusId ? tileDef(config, state.pieces[focusId]!.definitionId).focus : undefined;
  for (const neighbor of neighborDefs(state, config, x, y)) {
    if (tile.bonus && matches(neighbor, tile.bonus)) score += tile.bonus.vp;
    if (focus && matches(neighbor, focus)) score += focus.vp;
  }
  return score;
}

function enact(state: ParkState, config: ParkConfig, command: ParkCommand): void {
  const player = state.players[command.playerId]!;
  switch (command.type) {
    case "discardTile": {
      pullHand(player, command.instanceId);
      state.tileDiscard.push(command.instanceId);
      say(state, `${player.name} сбрасывает «${tileName(state, config, command.instanceId)}»`);
      if (state.phase === "reaction") {
        state.phase = state.reactionThen;
        if (state.phase === "trim") settleTrim(state, config);
        return;
      }
      if (state.phase === "start") {
        state.startNeed -= 1;
        if (state.startNeed <= 0 || player.hand.length === 0) state.phase = "move";
        return;
      }
      settleTrim(state, config);
      return;
    }
    case "moveSelf": {
      player.x = command.x;
      player.y = command.y;
      say(state, `${player.name} переходит на ${command.x}, ${command.y}`);
      state.phase = "action";
      return;
    }
    case "moveDiseases": {
      stepDiseases(state, config);
      state.phase = "action";
      return;
    }
    case "shiftTile": {
      const from = cellKey(command.fromX, command.fromY);
      const to = cellKey(command.toX, command.toY);
      const instanceId = state.ground[from]!;
      delete state.ground[from];
      state.ground[to] = instanceId;
      for (const person of Object.values(state.players)) {
        if (person.x === command.fromX && person.y === command.fromY) {
          person.x = command.toX;
          person.y = command.toY;
        }
      }
      for (const disease of state.diseases) {
        if (disease.x === command.fromX && disease.y === command.fromY) {
          disease.x = command.toX;
          disease.y = command.toY;
        }
      }
      say(state, `${player.name} переставляет «${tileName(state, config, instanceId)}»`);
      drawReaction(state, config, player.id, "action");
      return;
    }
    case "drawTiles": {
      const pulled = pullTiles(state, 2);
      player.hand.push(...pulled.drawn);
      say(state, `${player.name} берёт тайлы: ${pulled.drawn.length}`);
      if (pulled.ended) {
        finish(state, "tiles");
        return;
      }
      state.phase = "trim";
      settleTrim(state, config);
      return;
    }
    case "placeTile": {
      const definition = tileDef(config, state.pieces[command.instanceId]!.definitionId);
      const score = placeScore(state, config, definition.id, command.x, command.y, command.focusId);
      pullHand(player, command.instanceId);
      state.ground[cellKey(command.x, command.y)] = command.instanceId;
      if (command.focusId) {
        pullHand(player, command.focusId);
        state.tileDiscard.push(command.focusId);
      }
      player.vp += score;
      const focusNote = command.focusId ? " с фокусом" : "";
      say(state, `${player.name} ставит «${definition.name}»${focusNote}: ${score} очк.`);
      state.phase = "trim";
      settleTrim(state, config);
      return;
    }
    case "shoot": {
      const disease = state.diseases.find((item) => item.id === command.diseaseId)!;
      const character = characterDef(config, player.characterId);
      let killed = false;
      let nudge = false;
      for (let die = 0; die < character.combat; die += 1) {
        const roll = nextInt(state.rng, 6);
        state.rng = roll.state;
        const face = roll.value + 1;
        if (face === 6) killed = true;
        else if (face >= 3) nudge = true;
      }
      const diseaseName = diseaseDef(config, disease.definitionId).name;
      if (killed) {
        state.diseases = state.diseases.filter((item) => item.id !== disease.id);
        player.vp += 1;
        say(state, `${player.name} убивает «${diseaseName}»`);
        state.phase = "trim";
        settleTrim(state, config);
        return;
      }
      if (nudge) nudgeDisease(state, disease);
      say(state, `${player.name} промахивается по «${diseaseName}»`);
      drawReaction(state, config, player.id, "trim");
      return;
    }
    case "exitPark": {
      player.exited = true;
      player.vp += 2;
      say(state, `${player.name} выбирается из парка`);
      if (state.turnOrder.every((id) => state.players[id]?.exited)) {
        finish(state, "exits");
        return;
      }
      advance(state);
      return;
    }
    default: {
      const unknown: never = command;
      throw new Error(`Неизвестная команда ${JSON.stringify(unknown)}`);
    }
  }
}

function moveActions(state: ParkState, config: ParkConfig, player: ParkPlayer): ParkLegalAction[] {
  const actions: ParkLegalAction[] = [];
  for (const cell of reachable(state, config, player)) {
    actions.push({
      command: { type: "moveSelf", playerId: player.id, x: cell.x, y: cell.y },
      label: `Идти на ${cell.x}, ${cell.y}`,
    });
  }
  actions.push({ command: { type: "moveDiseases", playerId: player.id }, label: "Сдвинуть болезни" });
  for (const shift of shifts(state, config, player)) {
    const instanceId = state.ground[cellKey(shift.fromX, shift.fromY)]!;
    actions.push({
      command: { type: "shiftTile", playerId: player.id, ...shift },
      label: `Переставить «${tileName(state, config, instanceId)}» на ${shift.toX}, ${shift.toY}`,
    });
  }
  return actions;
}

function actionActions(state: ParkState, config: ParkConfig, player: ParkPlayer): ParkLegalAction[] {
  const actions: ParkLegalAction[] = [];
  const spots = emptyNextTo(player.x, player.y).filter((spot) => !state.ground[cellKey(spot.x, spot.y)]);
  const focuses = player.hand.filter((instanceId) => tileDef(config, state.pieces[instanceId]!.definitionId).kind === "focus");
  for (const instanceId of player.hand) {
    const definition = tileDef(config, state.pieces[instanceId]!.definitionId);
    if (definition.kind === "focus") continue;
    for (const spot of spots) {
      actions.push({
        command: { type: "placeTile", playerId: player.id, instanceId, x: spot.x, y: spot.y },
        label: `Поставить «${definition.name}» на ${spot.x}, ${spot.y}`,
      });
      for (const focusId of focuses) {
        actions.push({
          command: { type: "placeTile", playerId: player.id, instanceId, x: spot.x, y: spot.y, focusId },
          label: `Поставить «${definition.name}» на ${spot.x}, ${spot.y} с «${tileName(state, config, focusId)}»`,
        });
      }
    }
  }
  if (state.tileDeck.length > 0 || state.tileDiscard.length > 0 || state.tileRebuilds === 0) {
    actions.push({ command: { type: "drawTiles", playerId: player.id }, label: "Взять 2 тайла" });
  }
  const character = characterDef(config, player.characterId);
  for (const disease of state.diseases) {
    if (manhattan(player.x, player.y, disease.x, disease.y) > character.combat) continue;
    actions.push({
      command: { type: "shoot", playerId: player.id, diseaseId: disease.id },
      label: `Выстрелить: ${diseaseDef(config, disease.definitionId).name}`,
    });
  }
  const under = placedKind(state, config, player.x, player.y);
  if (under === "exit") actions.push({ command: { type: "exitPark", playerId: player.id }, label: "Выйти из парка" });
  return actions;
}

function settleTrim(state: ParkState, config: ParkConfig): void {
  if (state.status !== "playing") return;
  if (state.phase !== "trim") return;
  const player = active(state);
  if (player.hand.length <= config.handLimit) advance(state);
}

function advance(state: ParkState): void {
  if (state.status !== "playing") return;
  const total = state.turnOrder.length;
  for (let step = 0; step < total; step += 1) {
    state.active = (state.active + 1) % total;
    if (state.active === 0) state.round += 1;
    if (state.round > 24) {
      finish(state, "time");
      return;
    }
    if (state.closingLeft != null) {
      state.closingLeft -= 1;
      if (state.closingLeft <= 0) {
        finish(state, "heart");
        return;
      }
    }
    const player = active(state);
    if (player.exited) continue;
    const sharing = state.diseases.filter((disease) => disease.x === player.x && disease.y === player.y).length;
    state.startNeed = sharing;
    state.phase = sharing > 0 && player.hand.length > 0 ? "start" : "move";
    say(state, `Ход ${state.round}: ${player.name}`);
    return;
  }
  finish(state, "exits");
}

function pullTiles(state: ParkState, amount: number): { drawn: string[]; ended: boolean } {
  const drawn: string[] = [];
  for (let card = 0; card < amount; card += 1) {
    if (state.tileDeck.length === 0) {
      if (state.tileRebuilds >= 1) return { drawn, ended: true };
      state.tileRebuilds = 1;
      if (state.tileDiscard.length === 0) break;
      state.tileDeck = state.tileDiscard;
      state.tileDiscard = [];
      state.rng = shuffleInPlace(state.tileDeck, state.rng);
    }
    const next = state.tileDeck.pop();
    if (next) drawn.push(next);
  }
  return { drawn, ended: false };
}

function drawReaction(state: ParkState, config: ParkConfig, playerId: string, thenPhase: "action" | "trim"): void {
  if (state.status !== "playing") return;
  if (state.reactionDeck.length === 0) {
    if (state.reactionDiscard.length === 0) {
      state.phase = thenPhase;
      if (thenPhase === "trim") settleTrim(state, config);
      return;
    }
    state.reactionDeck = state.reactionDiscard;
    state.reactionDiscard = [];
    state.rng = shuffleInPlace(state.reactionDeck, state.rng);
  }
  const definitionId = state.reactionDeck.pop();
  if (!definitionId) return;
  const reaction = reactionDef(config, definitionId);
  const player = state.players[playerId]!;
  say(state, `Реакция тела: ${reaction.name}`);
  if (reaction.effect !== "heart") state.reactionDiscard.push(definitionId);
  if (reaction.effect === "heart") {
    state.hearts += 1;
    if (state.hearts >= 2) {
      finish(state, "heart");
      return;
    }
    state.closingLeft = state.turnOrder.length * 2;
    say(state, "Первый сердечный приступ: парк скоро закроется");
    state.phase = thenPhase;
    if (thenPhase === "trim") settleTrim(state, config);
    return;
  }
  if (reaction.effect === "spawn") {
    spawnDisease(state, config);
    state.phase = thenPhase;
    if (thenPhase === "trim") settleTrim(state, config);
    return;
  }
  if (reaction.effect === "shove") {
    shove(state, player);
    state.phase = thenPhase;
    if (thenPhase === "trim") settleTrim(state, config);
    return;
  }
  if (player.hand.length === 0) {
    state.phase = thenPhase;
    if (thenPhase === "trim") settleTrim(state, config);
    return;
  }
  state.reactionThen = thenPhase;
  state.phase = "reaction";
}

function spawnDisease(state: ParkState, config: ParkConfig): void {
  const definitionId = state.diseaseSupply.pop();
  if (!definitionId) {
    say(state, "Новой болезни не осталось");
    return;
  }
  const spot = spawnSpot(state);
  const id = `d${state.pieceSeq}`;
  state.pieceSeq += 1;
  state.diseases.push({ id, definitionId, x: spot.x, y: spot.y });
  say(state, `На поле выходит «${diseaseDef(config, definitionId).name}»`);
}

function spawnSpot(state: ParkState): { x: number; y: number } {
  const cells = Object.keys(state.ground).map(parseKey);
  cells.sort((a, b) => diseasesAt(state, a.x, a.y) - diseasesAt(state, b.x, b.y) || a.x - b.x || a.y - b.y);
  return cells[0] ?? { x: 0, y: 0 };
}

function shove(state: ParkState, player: ParkPlayer): void {
  const options = dirs
    .map(([dx, dy]) => ({ x: player.x + dx, y: player.y + dy }))
    .filter((cell) => state.ground[cellKey(cell.x, cell.y)]);
  if (options.length === 0) return;
  const roll = nextInt(state.rng, options.length);
  state.rng = roll.state;
  const cell = options[roll.value]!;
  player.x = cell.x;
  player.y = cell.y;
  say(state, `${player.name} смещается на ${cell.x}, ${cell.y}`);
}

function stepDiseases(state: ParkState, config: ParkConfig): void {
  if (state.diseases.length === 0) {
    say(state, "Болезней на поле нет");
    return;
  }
  for (const disease of state.diseases) {
    const step = stepTowardPlayer(state, disease);
    if (!step) continue;
    disease.x = step.x;
    disease.y = step.y;
    say(state, `«${diseaseDef(config, disease.definitionId).name}» ползёт на ${step.x}, ${step.y}`);
  }
}

function stepTowardPlayer(state: ParkState, disease: ParkDisease): { x: number; y: number } | null {
  const goals = Object.values(state.players).filter((player) => !player.exited);
  if (goals.length === 0) return null;
  const dist = distances(state, goals);
  const here = dist.get(cellKey(disease.x, disease.y));
  if (here == null || here === 0) return null;
  let best: { x: number; y: number; distance: number } | null = null;
  for (const [dx, dy] of dirs) {
    const x = disease.x + dx;
    const y = disease.y + dy;
    const distance = dist.get(cellKey(x, y));
    if (distance == null || distance >= here) continue;
    if (!best || distance < best.distance || (distance === best.distance && (x < best.x || (x === best.x && y < best.y)))) {
      best = { x, y, distance };
    }
  }
  return best ? { x: best.x, y: best.y } : null;
}

function distances(state: ParkState, goals: { x: number; y: number }[]): Map<string, number> {
  const dist = new Map<string, number>();
  const queue: string[] = [];
  for (const goal of goals) {
    const key = cellKey(goal.x, goal.y);
    if (!state.ground[key] || dist.has(key)) continue;
    dist.set(key, 0);
    queue.push(key);
  }
  for (let index = 0; index < queue.length; index += 1) {
    const key = queue[index]!;
    const { x, y } = parseKey(key);
    const base = dist.get(key)!;
    for (const [dx, dy] of dirs) {
      const next = cellKey(x + dx, y + dy);
      if (!state.ground[next] || dist.has(next)) continue;
      dist.set(next, base + 1);
      queue.push(next);
    }
  }
  return dist;
}

function nudgeDisease(state: ParkState, disease: ParkDisease): void {
  for (const [dx, dy] of dirs) {
    const x = disease.x + dx;
    const y = disease.y + dy;
    if (!state.ground[cellKey(x, y)]) continue;
    disease.x = x;
    disease.y = y;
    return;
  }
}

function reachable(state: ParkState, config: ParkConfig, player: ParkPlayer): { x: number; y: number }[] {
  const character = characterDef(config, player.characterId);
  const best = new Map<string, number>([[cellKey(player.x, player.y), 0]]);
  const queue = [{ x: player.x, y: player.y, cost: 0 }];
  const found: { x: number; y: number }[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const [dx, dy] of dirs) {
      const x = current.x + dx;
      const y = current.y + dy;
      const kind = placedKind(state, config, x, y);
      if (!kind) continue;
      const cost = current.cost + (kind === "transit" ? 0 : 1);
      if (cost > character.move) continue;
      const key = cellKey(x, y);
      if ((best.get(key) ?? Infinity) <= cost) continue;
      best.set(key, cost);
      queue.push({ x, y, cost });
      if (!(x === player.x && y === player.y)) found.push({ x, y });
    }
  }
  const unique = new Map<string, { x: number; y: number }>();
  for (const cell of found) unique.set(cellKey(cell.x, cell.y), cell);
  unique.delete(cellKey(player.x, player.y));
  return [...unique.values()];
}

function shifts(
  state: ParkState,
  config: ParkConfig,
  player: ParkPlayer,
): { fromX: number; fromY: number; toX: number; toY: number }[] {
  const sources = [{ x: player.x, y: player.y }, ...emptyNextTo(player.x, player.y)].filter((cell) => {
    const instanceId = state.ground[cellKey(cell.x, cell.y)];
    if (!instanceId) return false;
    const kind = kindOf(state, config, instanceId);
    return kind !== "entrance" && kind !== "transit";
  });
  const result: { fromX: number; fromY: number; toX: number; toY: number }[] = [];
  for (const source of sources) {
    for (const dest of emptyNextTo(source.x, source.y)) {
      if (state.ground[cellKey(dest.x, dest.y)]) continue;
      result.push({ fromX: source.x, fromY: source.y, toX: dest.x, toY: dest.y });
    }
  }
  return result;
}

function neighborDefs(state: ParkState, config: ParkConfig, x: number, y: number): { kind: TileKind; color?: ParkTileDefinition["color"] }[] {
  const found = [];
  for (const cell of emptyNextTo(x, y)) {
    const instanceId = state.ground[cellKey(cell.x, cell.y)];
    if (!instanceId) continue;
    const definitionId = state.pieces[instanceId]!.definitionId;
    if (definitionId === "entrance") found.push({ kind: "entrance" as const });
    else {
      const tile = tileDef(config, definitionId);
      found.push({ kind: tile.kind, ...(tile.color ? { color: tile.color } : {}) });
    }
  }
  return found;
}

function matches(tile: { kind: TileKind; color?: ParkTileDefinition["color"] }, bonus: NeighborBonus): boolean {
  if (bonus.color && tile.color !== bonus.color) return false;
  if (bonus.kind && tile.kind !== bonus.kind) return false;
  return Boolean(bonus.color || bonus.kind);
}

export function recover(state: ParkState, config: ParkConfig): void {
  if (state.status !== "playing" || state.phase !== "action") return;
  if (actionActions(state, config, active(state)).length === 0) finish(state, "tiles");
}

function finish(state: ParkState, reason: NonNullable<ParkState["outcome"]>["reason"]): void {
  if (state.status === "over") return;
  const scores = Object.values(state.players).map((player) => player.vp);
  const best = Math.max(...scores, 0);
  state.status = "over";
  state.outcome = {
    reason,
    winnerIds: Object.values(state.players)
      .filter((player) => player.vp === best)
      .map((player) => player.id),
  };
  const names = state.outcome.winnerIds.map((id) => state.players[id]!.name).join(", ");
  say(state, `Парк закрыт. Впереди ${names} (${best} очк.)`);
}

function pullHand(player: ParkPlayer, instanceId: string): void {
  const index = player.hand.indexOf(instanceId);
  if (index >= 0) player.hand.splice(index, 1);
}

function placedKind(state: ParkState, config: ParkConfig, x: number, y: number): TileKind | null {
  const instanceId = state.ground[cellKey(x, y)];
  if (!instanceId) return null;
  return kindOf(state, config, instanceId);
}

function kindOf(state: ParkState, config: ParkConfig, instanceId: string): TileKind {
  const definitionId = state.pieces[instanceId]!.definitionId;
  if (definitionId === "entrance") return "entrance";
  return tileDef(config, definitionId).kind;
}

function tileName(state: ParkState, config: ParkConfig, instanceId: string): string {
  const definitionId = state.pieces[instanceId]!.definitionId;
  if (definitionId === "entrance") return config.entrance.name;
  return tileDef(config, definitionId).name;
}

function emptyNextTo(x: number, y: number): { x: number; y: number }[] {
  return dirs.map(([dx, dy]) => ({ x: x + dx, y: y + dy }));
}

function diseasesAt(state: ParkState, x: number, y: number): number {
  return state.diseases.filter((disease) => disease.x === x && disease.y === y).length;
}

function manhattan(ax: number, ay: number, bx: number, by: number): number {
  return Math.abs(ax - bx) + Math.abs(ay - by);
}

function parseKey(key: string): { x: number; y: number } {
  const [x, y] = key.split(",").map(Number);
  return { x: x ?? 0, y: y ?? 0 };
}

function mint(state: ParkState, definitionId: string): string {
  const instanceId = `c${state.pieceSeq}`;
  state.pieceSeq += 1;
  state.pieces[instanceId] = { instanceId, definitionId };
  return instanceId;
}

function say(state: ParkState, message: string): void {
  state.seq += 1;
  state.log.push({ id: state.seq, message });
}

function active(state: ParkState): ParkPlayer {
  return state.players[state.turnOrder[state.active]!]!;
}

export function tileDef(config: ParkConfig, id: string): ParkTileDefinition {
  const found = config.tiles.find((tile) => tile.id === id);
  if (!found) throw new Error(`Нет тайла ${id}`);
  return found;
}

function diseaseDef(config: ParkConfig, id: string): ParkDiseaseDefinition {
  const found = config.diseases.find((disease) => disease.id === id);
  if (!found) throw new Error(`Нет болезни ${id}`);
  return found;
}

function reactionDef(config: ParkConfig, id: string): ParkReactionDefinition {
  const found = config.reactions.find((reaction) => reaction.id === id);
  if (!found) throw new Error(`Нет реакции ${id}`);
  return found;
}

export function characterDef(config: ParkConfig, id: string): ParkConfig["characters"][number] {
  const found = config.characters.find((character) => character.id === id);
  if (!found) throw new Error(`Нет героя ${id}`);
  return found;
}

export function phasePrompt(phase: ParkPhase, startNeed: number, handLimit: number): string {
  if (phase === "start") return `Сбросьте ${startNeed} ${tileWord(startNeed)}: на вашей клетке болезнь.`;
  if (phase === "move") return "Перейдите, сдвиньте болезни или переставьте соседний тайл.";
  if (phase === "action") return "Положите тайл рядом с собой, возьмите два, выстрелите или выйдите.";
  if (phase === "trim") return `Сбросьте лишние тайлы: в руке не больше ${handLimit}.`;
  return "Реакция тела: сбросьте один тайл.";
}

function tileWord(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "тайл";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "тайла";
  return "тайлов";
}
