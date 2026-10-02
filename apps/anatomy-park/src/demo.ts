import { ParkMatch } from "@deckforge/engine";
import { anatomyPark } from "./catalog";

const match = ParkMatch.create(anatomyPark, {
  seed: 11,
  players: [
    { name: "Рик", controller: "ai", characterId: "rick" },
    { name: "Морти", controller: "ai", characterId: "morty" },
  ],
});
const state = match.getState();
console.log(anatomyPark.title);
console.log(`сид 11, круг ${state.round}, статус ${state.status} (${state.outcome?.reason ?? "—"})`);
for (const event of state.log.slice(-6)) console.log(`  ${event.message}`);
