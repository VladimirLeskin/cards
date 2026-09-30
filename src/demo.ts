import { createEngine } from "./index.js";

const engine = createEngine();
const games = [
  {
    gameId: "hogwarts",
    seed: 7,
    players: [
      { name: "Гарри", controller: "ai" as const, heroId: "harry" },
      { name: "Рон", controller: "ai" as const, heroId: "ron" },
    ],
  },
  {
    gameId: "anatomy-park",
    seed: 11,
    players: [
      { name: "Рик", controller: "ai" as const, heroId: "rick" },
      { name: "Морти", controller: "ai" as const, heroId: "morty" },
    ],
  },
];

for (const spec of games) {
  const match = engine.createMatch(spec);
  const state = match.getState();
  const title = engine.listGames().find((game) => game.id === spec.gameId)?.title ?? spec.gameId;
  console.log(`\n${title}`);
  console.log(`сид ${spec.seed}, ходов ${state.turn}, статус ${state.status} (${state.outcome?.reason ?? "—"})`);
  for (const event of state.log.slice(-6)) console.log(`  ${event.message}`);
}

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
