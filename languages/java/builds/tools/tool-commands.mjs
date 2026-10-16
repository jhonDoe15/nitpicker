import { readFileSync, statSync } from 'node:fs';
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

function commandOf(tool) {
  return JSON.parse(readFileSync(TOOL_COMMANDS_FILE, 'utf8'))[tool];
}

export function reportRootPattern(tool) {
  const { root } = commandOf(tool).accept;
  return root === undefined ? undefined : new RegExp(`<${root}[\\s/>]`, 'u');
}

function wroteReport(file, rootPattern) {
  if (statSync(file, { throwIfNoEntry: false })?.isFile() !== true) {
    return false;
  }
  return rootPattern === undefined || rootPattern.test(readFileSync(file, 'utf8'));
}

export function toolCommand(tool, values) {
  const command = commandOf(tool);
  const { exits, report } = command.accept;
  const rootPattern = reportRootPattern(tool);
  return {
    launcher:
      command.launcher === undefined
        ? undefined
        : path.resolve(path.dirname(TOOL_COMMANDS_FILE), command.launcher),
    args: command.args.flatMap((token) => expanded(token, values)),
    accepts: (status) =>
      (exits === undefined || exits.includes(status)) &&
      (report === undefined || wroteReport(values[report], rootPattern)),
  };
}
