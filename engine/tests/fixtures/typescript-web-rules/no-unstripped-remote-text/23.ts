import { stripVTControlCharacters } from "node:util";
const res = await fetch(u); const text = await res.text(); console.error(text, text);