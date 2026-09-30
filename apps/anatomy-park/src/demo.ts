import { createEngine } from "@deckforge/engine";
import { anatomyParkModule } from "./module";

const engine = createEngine([anatomyParkModule]);
const match = engine.createMatch({
  gameId: "anatomy-park",
  seed: 11,
  players: [
    { name: "Рик", controller: "ai", heroId: "rick" },
    { name: "Морти", controller: "ai", heroId: "morty" },
  ],
});
const state = match.getState();
console.log(anatomyParkModule.config.title);
console.log(`сид 11, ходов ${state.turn}, статус ${state.status} (${state.outcome?.reason ?? "—"})`);
for (const event of state.log.slice(-6)) console.log(`  ${event.message}`);
