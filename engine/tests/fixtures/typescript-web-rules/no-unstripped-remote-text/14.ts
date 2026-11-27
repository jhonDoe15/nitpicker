import { stripVTControlCharacters } from "node:util";
const config = await load(); console.log(config.name);