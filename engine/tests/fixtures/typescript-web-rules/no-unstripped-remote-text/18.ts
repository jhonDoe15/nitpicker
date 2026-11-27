import { stripVTControlCharacters } from "node:util";
ws.on("message", (data) => console.log(data.toString()));