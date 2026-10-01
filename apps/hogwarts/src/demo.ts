import { createEngine } from "@deckforge/engine";
import { hogwartsModule } from "./module";

const engine = createEngine([hogwartsModule]);
const match = engine.createMatch({
  gameId: "hogwarts",
  seed: 7,
  players: [
    { name: "Гарри", controller: "ai", heroId: "harry" },
    { name: "Рон", controller: "ai", heroId: "ron" },
  ],
});
const state = match.getState();
console.log(hogwartsModule.config.title);
console.log(`сид 7, ходов ${state.turn}, статус ${state.status} (${state.outcome?.reason ?? "—"})`);
for (const event of state.log.slice(-6)) console.log(`  ${event.message}`);

const mixed = engine.createMatch({
  gameId: "hogwarts",
  seed: 3,
  players: [
    { name: "Игрок", controller: "human", heroId: "hermione" },
    { name: "Компьютер", controller: "ai", heroId: "neville" },
  ],
});
const view = mixed.view("p1");
console.log(`\nСмешанная партия, ходит ${view.players.find((player) => player.id === view.activePlayerId)?.name}`);
console.log(`Доступно действий: ${view.legalActions.length}`);
console.log(view.legalActions.slice(0, 5).map((action) => action.label).join("; "));
