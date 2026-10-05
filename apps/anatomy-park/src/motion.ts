export interface MotionSnap {
  hand: string[];
  /** instance id -> "x,y" */
  ground: Record<string, string>;
  log: { id: number; message: string }[];
  diseases: string[];
  places: Record<string, string>;
  vp: Record<string, number>;
  /** Чья рука сейчас на экране. Смена места — не добор из колоды. */
  seat: string;
}

export interface MotionPlan {
  incoming: string[];
  placed: string[];
  discarded: string[];
  shifted: string[];
  risen: string[];
  walked: string[];
  spawned: string[];
  notes: string[];
  vpChanged: string[];
  seatChanged: boolean;
}

export function notableLog(message: string): boolean {
  if (/^Ход \d/.test(message)) return false;
  if (message.startsWith("Парк открыт")) return false;
  if (message.startsWith("Болезней на поле нет")) return false;
  if (message.includes("берёт тайлы")) return false;
  if (message.includes("сбрасывает")) return false;
  return true;
}

/** What changed between two views. Does not apply rules — only describes the pictures to move. */
export function planMotion(prev: MotionSnap | null, next: MotionSnap): MotionPlan {
  if (!prev) {
    return {
      incoming: [...next.hand],
      placed: [],
      discarded: [],
      shifted: [],
      risen: [],
      walked: [],
      spawned: [],
      notes: [],
      vpChanged: [],
      seatChanged: false,
    };
  }
  const seatChanged = prev.seat !== next.seat;
  const prevHand = new Set(prev.hand);
  const nextHand = new Set(next.hand);
  const incoming = seatChanged ? [] : next.hand.filter((id) => !prevHand.has(id));
  const placed: string[] = [];
  const discarded: string[] = [];
  for (const id of prev.hand) {
    if (nextHand.has(id)) continue;
    if (next.ground[id]) placed.push(id);
    else if (!seatChanged) discarded.push(id);
  }
  const shifted: string[] = [];
  const risen: string[] = [];
  for (const [id, pos] of Object.entries(next.ground)) {
    const was = prev.ground[id];
    if (was && was !== pos) shifted.push(id);
    else if (!was && !prevHand.has(id)) risen.push(id);
  }
  const walked = Object.keys(next.places).filter((id) => prev.places[id] && prev.places[id] !== next.places[id]);
  const prevDiseases = new Set(prev.diseases);
  const spawned = next.diseases.filter((id) => !prevDiseases.has(id));
  const seen = new Set(prev.log.map((entry) => entry.id));
  const notes = next.log
    .filter((entry) => !seen.has(entry.id) && notableLog(entry.message))
    .map((entry) => entry.message)
    .slice(-4);
  const vpChanged = Object.keys(next.vp).filter((id) => prev.vp[id] !== next.vp[id]);
  return { incoming, placed, discarded, shifted, risen, walked, spawned, notes, vpChanged, seatChanged };
}
