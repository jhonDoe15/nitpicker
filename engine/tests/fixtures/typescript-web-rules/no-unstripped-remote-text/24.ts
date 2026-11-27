import { stripVTControlCharacters } from "node:util";
import.meta.hot.on("vite:console", ({ text }) => console.log(text));