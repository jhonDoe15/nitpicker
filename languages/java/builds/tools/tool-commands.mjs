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

function wroteReport(file, root) {
  if (!existsSync(file)) {
    return false;
  }
  return root === undefined || new RegExp(`<${root}[\\s/>]`, 'u').test(readFileSync(file, 'utf8'));
}

export function toolCommand(tool, values) {
  const command = JSON.parse(readFileSync(TOOL_COMMANDS_FILE, 'utf8'))[tool];
  const { exits, report, root } = command.accept;
  return {
    launcher:
      command.launcher === undefined
        ? undefined
        : path.resolve(path.dirname(TOOL_COMMANDS_FILE), command.launcher),
    args: command.args.flatMap((token) => expanded(token, values)),
    accepts: (status) =>
      (exits === undefined || exits.includes(status)) &&
      (report === undefined || wroteReport(values[report], root)),
  };
}
