import { stripVTControlCharacters } from "node:util";
const res = await fetch(u); const body = await res.text(); console.log(JSON.stringify(body));