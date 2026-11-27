import { stripVTControlCharacters } from "node:util";
socket.on("message", (data) => this.logger.debug(`got ${data.text}`));