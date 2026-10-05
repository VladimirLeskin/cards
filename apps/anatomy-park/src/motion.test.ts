import { describe, expect, it } from "vitest";
import { planMotion, type MotionSnap } from "./motion";

function snap(partial: Partial<MotionSnap> = {}): MotionSnap {
  return {
    hand: [],
    ground: {},
    log: [],
    diseases: [],
    places: { p1: "0,0" },
    vp: { p1: 0 },
    seat: "p1",
    ...partial,
  };
}

describe("движение картинок", () => {
  it("раздаёт стартовую руку из колоды", () => {
    const plan = planMotion(null, snap({ hand: ["c1", "c2"] }));
    expect(plan.incoming).toEqual(["c1", "c2"]);
    expect(plan.placed).toEqual([]);
    expect(plan.notes).toEqual([]);
  });

  it("отличает добор, укладку и сброс", () => {
    const before = snap({ hand: ["c1", "c2"], ground: { entrance: "0,0" } });
    const after = snap({
      hand: ["c3"],
      ground: { entrance: "0,0", c1: "1,0" },
      log: [{ id: 1, message: "Рик ставит «Шлюз»: 1 очк." }],
      vp: { p1: 1 },
    });
    const plan = planMotion(before, after);
    expect(plan.placed).toEqual(["c1"]);
    expect(plan.discarded).toEqual(["c2"]);
    expect(plan.incoming).toEqual(["c3"]);
    expect(plan.risen).toEqual([]);
    expect(plan.vpChanged).toEqual(["p1"]);
    expect(plan.notes).toEqual(["Рик ставит «Шлюз»: 1 очк."]);
  });

  it("показывает чужой тайл появлением, а свой сдвиг — переносом", () => {
    const before = snap({ ground: { entrance: "0,0", c1: "1,0" }, places: { p1: "0,0" } });
    const after = snap({
      ground: { entrance: "0,0", c1: "2,0", c9: "0,1" },
      places: { p1: "1,0" },
      diseases: ["d1"],
      log: [
        { id: 1, message: "Ход 2: Морти" },
        { id: 2, message: "Морти берёт тайлы: 2" },
        { id: 3, message: "Реакция тела: Чихание" },
      ],
    });
    const plan = planMotion(before, after);
    expect(plan.shifted).toEqual(["c1"]);
    expect(plan.risen).toEqual(["c9"]);
    expect(plan.walked).toEqual(["p1"]);
    expect(plan.spawned).toEqual(["d1"]);
    expect(plan.notes).toEqual(["Реакция тела: Чихание"]);
    expect(plan.seatChanged).toBe(false);
  });

  it("не рисует чужую руку как добор из колоды", () => {
    const before = snap({ seat: "p1", hand: ["a"], ground: { entrance: "0,0" } });
    const after = snap({ seat: "p2", hand: ["b", "c"], ground: { entrance: "0,0", a: "1,0" } });
    const plan = planMotion(before, after);
    expect(plan.seatChanged).toBe(true);
    expect(plan.incoming).toEqual([]);
    expect(plan.discarded).toEqual([]);
    expect(plan.placed).toEqual(["a"]);
  });
});
