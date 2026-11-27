import { stripVTControlCharacters } from "node:util";
const res = await fetch(u); const body = await res.json(); console.log(`Deployed: ${stripVTControlCharacters(body.name)}`);