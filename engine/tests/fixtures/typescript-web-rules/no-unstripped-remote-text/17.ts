import { stripVTControlCharacters } from "node:util";
socket.on("console", (payload) => logger.info(payload.text));