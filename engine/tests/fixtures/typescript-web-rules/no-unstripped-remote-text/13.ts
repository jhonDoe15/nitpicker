import { stripVTControlCharacters } from "node:util";
const body = await res.json(); console.log(body.name);