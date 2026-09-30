import { mountGame } from "@deckforge/table";
import "@deckforge/table/styles.css";
import { hogwartsModule } from "./module";

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("Не найден #app");

mountGame(root, {
  module: hogwartsModule,
  theme: {
    felt: "#143028",
    ink: "#f4ecd8",
    accent: "#e0b15a",
    danger: "#9d3b3b",
    paper: "#f7f1e3",
  },
});
