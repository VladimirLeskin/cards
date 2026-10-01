import type { Controller, RngState } from "../core/types";

export type TileKind = "attraction" | "food" | "ride" | "transit" | "exit" | "focus" | "entrance";

export type TileColor = "red" | "blue" | "brown" | "green" | "yellow";

export interface NeighborBonus {
  color?: TileColor;
  kind?: TileKind;
  vp: number;
}

export interface ParkTileDefinition {
  id: string;
  name: string;
  text: string;
  image: string;
  kind: Exclude<TileKind, "entrance">;
  color?: TileColor;
  vp: number;
  bonus?: NeighborBonus;
  /** Spent with a placement. The tile is not built; the next tile scores this per matching neighbor. */
  focus?: NeighborBonus;
  copies: number;
}

export interface ParkDiseaseDefinition {
  id: string;
  name: string;
  image: string;
  copies: number;
}

export type ReactionEffect = "spawn" | "heart" | "discard" | "shove";

export interface ParkReactionDefinition {
  id: string;
  name: string;
  text: string;
  image: string;
  effect: ReactionEffect;
  copies: number;
}

export interface ParkCharacterDefinition {
  id: string;
  name: string;
  image: string;
  move: number;
  combat: number;
}

export interface ParkConfig {
  id: string;
  title: string;
  description: string;
  playerCount: { min: number; max: number };
  handLimit: number;
  openingHand: number;
  entrance: { name: string; text: string; image: string };
  tiles: ParkTileDefinition[];
  diseases: ParkDiseaseDefinition[];
  reactions: ParkReactionDefinition[];
  characters: ParkCharacterDefinition[];
}

export interface ParkPiece {
  instanceId: string;
  definitionId: string;
}

export interface ParkPlayer {
  id: string;
  name: string;
  controller: Controller;
  characterId: string;
  x: number;
  y: number;
  exited: boolean;
  vp: number;
  hand: string[];
}

export interface ParkDisease {
  id: string;
  definitionId: string;
  x: number;
  y: number;
}

export type ParkPhase = "start" | "move" | "action" | "trim" | "reaction";

export interface ParkLogEntry {
  id: number;
  message: string;
}

export interface ParkState {
  configId: string;
  rng: RngState;
  seq: number;
  pieceSeq: number;
  status: "playing" | "over";
  outcome?: { reason: "heart" | "tiles" | "exits" | "time"; winnerIds: string[] };
  round: number;
  active: number;
  turnOrder: string[];
  phase: ParkPhase;
  /** Phase to enter after a reaction discard is resolved. */
  reactionThen: "action" | "trim";
  /** Discards still required because diseases share the player's tile. */
  startNeed: number;
  players: Record<string, ParkPlayer>;
  pieces: Record<string, ParkPiece>;
  /** "x,y" -> tile instance id */
  ground: Record<string, string>;
  diseases: ParkDisease[];
  diseaseSupply: string[];
  tileDeck: string[];
  tileDiscard: string[];
  /** How many times the tile deck has been rebuilt from the discard. The second miss ends the park. */
  tileRebuilds: number;
  reactionDeck: string[];
  reactionDiscard: string[];
  hearts: number;
  /** Player-turns left after the first heart. Null until then. */
  closingLeft: number | null;
  log: ParkLogEntry[];
}

export type ParkCommand =
  | { type: "discardTile"; playerId: string; instanceId: string }
  | { type: "moveSelf"; playerId: string; x: number; y: number }
  | { type: "moveDiseases"; playerId: string }
  | { type: "shiftTile"; playerId: string; fromX: number; fromY: number; toX: number; toY: number }
  | { type: "drawTiles"; playerId: string }
  | { type: "placeTile"; playerId: string; instanceId: string; x: number; y: number; focusId?: string }
  | { type: "shoot"; playerId: string; diseaseId: string }
  | { type: "exitPark"; playerId: string };

export interface ParkLegalAction {
  command: ParkCommand;
  label: string;
}

export interface ParkPlayerSetup {
  name: string;
  controller: Controller;
  characterId: string;
}

export interface CreateParkOptions {
  seed?: number;
  players: ParkPlayerSetup[];
}

export interface ParkCardView {
  instanceId: string;
  definitionId: string;
  name: string;
  text: string;
  image: string;
  kind: TileKind;
  color?: TileColor;
  vp: number;
}

export interface ParkCellView {
  x: number;
  y: number;
  tile: ParkCardView | null;
  players: { id: string; name: string }[];
  diseases: { id: string; name: string }[];
}

export interface ParkPlayerView {
  id: string;
  name: string;
  controller: Controller;
  characterId: string;
  characterName: string;
  image: string;
  move: number;
  combat: number;
  x: number;
  y: number;
  exited: boolean;
  vp: number;
  handCount: number;
}

export interface ParkView {
  title: string;
  description: string;
  status: ParkState["status"];
  outcome?: { reason: string; winners: { id: string; name: string; vp: number }[] };
  phase: ParkPhase;
  prompt: string;
  activePlayerId: string;
  round: number;
  hearts: number;
  closingLeft: number | null;
  tileDeckCount: number;
  reactionDeckCount: number;
  players: ParkPlayerView[];
  hand: ParkCardView[];
  cells: ParkCellView[];
  log: ParkLogEntry[];
  legalActions: ParkLegalAction[];
}
