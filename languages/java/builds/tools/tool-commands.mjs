import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const TOOL_COMMANDS_FILE = path.join(import.meta.dirname, 'tool-commands.json');

function expanded(token, values) {
  if (typeof token === 'string') {
    return [token];
  }
  if (token.each !== undefined) {
    return values[token.each].flatMap((value) =>
      token.flag === undefined ? [value] : [token.flag, value],
    );
  }
  const value =
    token.join === undefined
      ? values[token.value]
      : values[token.join].join(token.separator === 'path' ? path.delimiter : token.separator);
  return [`${token.prefix ?? ''}${value}`];
}

export function toolCommand(tool, values) {
  const command = JSON.parse(readFileSync(TOOL_COMMANDS_FILE, 'utf8'))[tool];
  const { exits, report } = command.accept;
  return {
    args: command.args.flatMap((token) => expanded(token, values)),
    accepts: (status) =>
      (exits === undefined || exits.includes(status)) &&
      (report === undefined || existsSync(values[report])),
  };
}
