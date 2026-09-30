/** Data model for a cooperative deck-building table. */

export type Controller = "human" | "ai";

/** Party shares a win/loss. Rival is reserved for a future versus ruleset. */
export type Side = "party" | "rival";

export type CardKind = "starter" | "market" | "enemy" | "location" | "event";

export type Trigger =
  | "onPlay"
  | "onAcquire"
  | "onReveal"
  | "onEnter"
  | "onDefeat"
  | "onTurnStart"
  | "onAttack";

export type ResourceRole = "attack" | "currency" | "heal" | "generic";

export type Persistence = "turn" | "persistent";

export interface ResourceGain {
  resource: string;
  amount: number;
}

export interface ResourceDefinition {
  id: string;
  name: string;
  role: ResourceRole;
  persistence: Persistence;
  icon: string;
  min: number;
  max?: number;
}

export type PlayerTarget = "current" | "all" | "choice" | "lowestHealth";

export type EnemyTarget = "all" | "choice" | "lowestHealth";

export interface ChoiceOption {
  id: string;
  label: string;
  effects: Effect[];
}

export type Effect =
  | { op: "gain"; resource: string; amount: number }
  | { op: "draw"; amount: number; player?: "current" | "all" | "choice" }
  | { op: "drawPlayer"; playerId: string; amount: number }
  | { op: "heal"; amount: number; target: PlayerTarget }
  | { op: "healPlayer"; playerId: string; amount: number }
  | { op: "damagePlayer"; amount: number; target: PlayerTarget }
  | { op: "damagePlayerDirect"; playerId: string; amount: number }
  | { op: "damageEnemy"; amount: number; target: EnemyTarget }
  | { op: "damageEnemyInstance"; instanceId: string; amount: number }
  | { op: "damageLocation"; amount: number }
  | { op: "addEnemy" }
  | { op: "spawnEnemies"; amount: number }
  | { op: "gainCard"; definitionId: string; to: "discard" | "hand" | "deckTop" }
  | {
      op: "discard";
      amount: number;
      player?: "current";
      mode?: "random" | "choice";
      orElse?: Effect[];
    }
  | { op: "discardInstance"; instanceId: string }
  | { op: "stun"; target: PlayerTarget }
  | { op: "stunPlayer"; playerId: string }
  | { op: "gainToken"; tokenId: string; amount: number; to: "current" | "supply" }
  | { op: "custom"; id: string; params?: Record<string, string | number | boolean> }
  | { op: "choice"; prompt: string; options: ChoiceOption[] }
  | { op: "closeLocation"; result: "completed" | "lost" };

export interface EffectBlock {
  trigger: Trigger;
  effects: Effect[];
}

export interface CardDefinition {
  id: string;
  name: string;
  kind: CardKind;
  text: string;
  image: string;
  tags: string[];
  cost?: number;
  health?: number;
  attack?: number;
  /** Enemies revealed when this location becomes active. */
  enemyCount?: number;
  /** Event cards drawn on a turn while this location is active. */
  eventCount?: number;
  /** Enemy slot cap while this location is active. */
  maxEnemies?: number;
  provides?: ResourceGain[];
  effects?: EffectBlock[];
  reward?: Effect[];
}

export interface HeroAbility {
  name: string;
  text: string;
  usage: "oncePerTurn" | "oncePerGame" | "passive";
  effects: Effect[];
}

export interface HeroDefinition {
  id: string;
  name: string;
  image: string;
  health: number;
  ability: HeroAbility;
  startingDeck: { definitionId: string; count: number }[];
}

export interface DieFaceDefinition {
  id: string;
  label: string;
  image?: string;
  effects: Effect[];
}

export interface DieDefinition {
  id: string;
  name: string;
  image: string;
  description: string;
  faces: DieFaceDefinition[];
}

export interface TokenDefinition {
  id: string;
  name: string;
  image: string;
  description: string;
  /** Bank size at the start of the match. */
  supply: number;
  /** Copies each hero starts holding, in addition to the bank. */
  eachPlayer: number;
  spendEffects?: Effect[];
}

export interface PropDefinition {
  id: string;
  name: string;
  image: string;
  description: string;
  usage: "oncePerTurn" | "unlimited";
  effects: Effect[];
}

export interface MechanicsConfig {
  handSize: number;
  marketSize: number;
  enemySlots: number;
  /** Fixed number, or read `eventCount` from the active location. */
  eventsPerTurn: number | "location";
  /**
   * never — enemies enter only through effects and the opening reveal.
   * onDefeat — a new enemy fills the slot after one is defeated.
   * upkeep — fill up to the location's enemyCount at the start of the turn.
   */
  enemyRefill: "never" | "onDefeat" | "upkeep";
  emptyEventDeck: "lose" | "reshuffle" | "ignore";
  emptyEnemyDeck: "ignore" | "reshuffle";
  stunOnZeroHealth: boolean;
  loseIfAllStunned: boolean;
  handVisibility: "open" | "owner";
  attackLocationWhileEnemies: boolean;
  maxTurns: number;
  buyDestination: "discard" | "hand";
}

export interface GameArt {
  cardBack: string;
  board: string;
  marketDeck: string;
  enemyDeck: string;
  eventDeck: string;
  locationBack: string;
}

export interface GameConfig {
  id: string;
  title: string;
  description: string;
  /** Cooperative party versus the board, or a seat-vs-seat ruleset. */
  mode: "cooperative" | "freeForAll";
  playerCount: { min: number; max: number };
  art: GameArt;
  resources: ResourceDefinition[];
  mechanics: MechanicsConfig;
  dice: DieDefinition[];
  tokens: TokenDefinition[];
  props: PropDefinition[];
  cards: CardDefinition[];
  heroes: HeroDefinition[];
  piles: {
    market: string[];
    enemies: string[];
    /** Played in order. Index 0 is the first location. */
    locations: string[];
    events: string[];
  };
}

export interface EffectContext {
  controllerId: string;
  sourceInstanceId?: string;
  trigger: string;
}

export interface EffectFrame {
  effects: Effect[];
  index: number;
  context: EffectContext;
}

export interface PendingDecision {
  id: string;
  playerId: string;
  prompt: string;
  options: { id: string; label: string }[];
  optionEffects: Effect[][];
  context: EffectContext;
}

export interface CardInstance {
  instanceId: string;
  definitionId: string;
  damage: number;
  resolved: boolean;
  ownerId: string | null;
}

export interface PlayerZones {
  deck: string[];
  hand: string[];
  discard: string[];
  play: string[];
}

export interface PlayerState {
  id: string;
  seat: number;
  name: string;
  controller: Controller;
  side: Side;
  aiProfile: string;
  heroId: string;
  health: number;
  maxHealth: number;
  stunned: boolean;
  pools: Record<string, number>;
  zones: PlayerZones;
  abilityUsedThisTurn: boolean;
  oncePerGameUsed: boolean;
}

export interface BoardState {
  market: { deck: string[]; row: (string | null)[] };
  enemies: { deck: string[]; active: string[]; discard: string[] };
  locations: {
    deck: string[];
    active: string | null;
    completed: string[];
    lost: string[];
  };
  events: { deck: string[]; discard: string[]; revealed: string[] };
  banished: string[];
}

export interface DieState {
  id: string;
  available: boolean;
  lastFaceId?: string;
}

export interface TokenState {
  supply: number;
  holders: Record<string, number>;
}

export interface PropState {
  id: string;
  usesThisTurn: number;
}

export interface PhaseState {
  id: "threat" | "action" | "cleanup";
  step: string;
  cursor: number;
  queue: string[];
}

export interface GameEvent {
  id: number;
  type: string;
  message: string;
  payload: Record<string, unknown>;
}

export interface Outcome {
  result: "won" | "lost";
  reason: string;
}

export interface RngState {
  s: number;
}

export interface GameState {
  matchId: string;
  configId: string;
  seed: number;
  rng: RngState;
  seq: number;
  status: "playing" | "won" | "lost";
  outcome?: Outcome;
  turn: number;
  activePlayerIndex: number;
  turnOrder: string[];
  phase: PhaseState;
  players: Record<string, PlayerState>;
  board: BoardState;
  cards: Record<string, CardInstance>;
  items: {
    dice: DieState[];
    tokens: Record<string, TokenState>;
    props: PropState[];
  };
  stack: EffectFrame[];
  pending: PendingDecision | null;
  log: GameEvent[];
}

export type AttackTarget =
  | { type: "enemy"; instanceId: string }
  | { type: "location" };

export type Command =
  | { type: "playCard"; playerId: string; instanceId: string }
  | { type: "buyCard"; playerId: string; instanceId: string }
  | { type: "assignAttack"; playerId: string; target: AttackTarget; amount: number }
  | { type: "assignHeal"; playerId: string; targetPlayerId: string; amount: number }
  | { type: "activateAbility"; playerId: string }
  | { type: "rollDie"; playerId: string; dieId: string }
  | { type: "spendToken"; playerId: string; tokenId: string }
  | { type: "useProp"; playerId: string; propId: string }
  | { type: "endTurn"; playerId: string }
  | { type: "choose"; playerId: string; optionId: string };

export interface LegalAction {
  command: Command;
  label: string;
}

export interface CardView {
  instanceId: string;
  definitionId: string;
  name: string;
  kind: CardKind;
  text: string;
  image: string;
  tags: string[];
  cost?: number;
  health?: number;
  damage: number;
  remainingHealth?: number;
  attack?: number;
  provides?: ResourceGain[];
}

export type HandView = CardView[] | { hidden: true; count: number };

export interface PlayerView {
  id: string;
  seat: number;
  name: string;
  controller: Controller;
  side: Side;
  heroId: string;
  heroName: string;
  heroImage: string;
  abilityName: string;
  abilityText: string;
  abilityAvailable: boolean;
  health: number;
  maxHealth: number;
  stunned: boolean;
  pools: Record<string, number>;
  hand: HandView;
  deckCount: number;
  discard: CardView[];
  play: CardView[];
  tokens: Record<string, number>;
}

export interface ClientView {
  matchId: string;
  configId: string;
  title: string;
  mode: GameConfig["mode"];
  art: GameArt;
  resources: ResourceDefinition[];
  status: GameState["status"];
  outcome?: Outcome;
  turn: number;
  phase: PhaseState;
  activePlayerId: string;
  viewerId?: string;
  players: PlayerView[];
  market: (CardView | null)[];
  marketDeckCount: number;
  enemies: CardView[];
  enemyDeckCount: number;
  location: CardView | null;
  locationsRemaining: number;
  eventsRevealed: CardView[];
  eventDeckCount: number;
  dice: {
    id: string;
    name: string;
    image: string;
    available: boolean;
    lastFaceId?: string;
  }[];
  props: {
    id: string;
    name: string;
    image: string;
    description: string;
    available: boolean;
  }[];
  tokens: { id: string; name: string; image: string; supply: number }[];
  pending: { id: string; playerId: string; prompt: string; options: { id: string; label: string }[] } | null;
  log: GameEvent[];
  legalActions: LegalAction[];
}

export interface PlayerSetup {
  name: string;
  controller: Controller;
  /** Defaults to party. Rivals need a freeForAll config. */
  side?: Side;
  heroId?: string;
  aiProfile?: string;
}

export interface CreateMatchOptions {
  gameId: string;
  seed?: number;
  players: PlayerSetup[];
}

export interface ApplyResult {
  ok: boolean;
  error?: string;
  events: GameEvent[];
  state: GameState;
}

export interface EffectHandlerContext {
  state: GameState;
  module: GameModule;
  context: EffectContext;
  params: Record<string, string | number | boolean>;
  emit: (type: string, message: string, payload?: Record<string, unknown>) => void;
  push: (effects: Effect[]) => void;
}

export type EffectHandler = (ctx: EffectHandlerContext) => void;

export interface GameModule {
  config: GameConfig;
  handlers: Record<string, EffectHandler>;
  cards: Map<string, CardDefinition>;
  heroes: Map<string, HeroDefinition>;
}
