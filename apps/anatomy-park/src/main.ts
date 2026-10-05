import { anatomyPark } from "./catalog";
import { mountPark } from "./mount";
import "./styles.css";

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("Не найден #app");

mountPark(root, anatomyPark);
