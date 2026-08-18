import { render } from "preact";
import { App } from "./app";
import "./styles/index.css";

const root = document.getElementById("app");
if (!root) throw new Error("Elemento #app não encontrado no index.html");

render(<App />, root);
