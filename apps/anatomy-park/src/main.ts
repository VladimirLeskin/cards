import { mountGame } from "@deckforge/table";
import "@deckforge/table/styles.css";
import { anatomyParkModule } from "./module";

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("Не найден #app");

mountGame(root, {
  module: anatomyParkModule,
  theme: {
    felt: "#10262c",
    ink: "#e7f6f4",
    accent: "#3dbea5",
    danger: "#d4656a",
    paper: "#e7f4f1",
  },
});
