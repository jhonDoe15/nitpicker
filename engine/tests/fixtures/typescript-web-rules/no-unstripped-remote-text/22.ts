import { stripVTControlCharacters } from "node:util";
const res = await fetch(u); process.stderr.write(await res.text());