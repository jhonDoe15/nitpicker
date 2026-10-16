import { readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
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
  return rootPattern === undefined || new RegExp(rootPattern, 'u').test(readFileSync(file, 'utf8'));
}

export function commandSpec(tool, values) {
  const command = commandOf(tool);
  const { exits, report } = command.accept;
  return {
    launcher:
      command.launcher === undefined
        ? undefined
        : path.resolve(path.dirname(TOOL_COMMANDS_FILE), command.launcher),
    args: command.args.flatMap((token) => expanded(token, values)),
    accept: {
      exits,
      report: report === undefined ? undefined : values[report],
      reportPattern: reportRootPattern(tool)?.source,
    },
  };
}

export function toolCommand(tool, values) {
  const { launcher, args, accept } = commandSpec(tool, values);
  return {
    launcher,
    args,
    accepts: (status) =>
      (accept.exits === undefined || accept.exits.includes(status)) &&
      (accept.report === undefined || wroteReport(accept.report, accept.reportPattern)),
  };
}

export function main([tool, valuesFile, outputFile]) {
  const values = JSON.parse(readFileSync(valuesFile, 'utf8'));
  writeFileSync(outputFile, JSON.stringify(commandSpec(tool, values)));
}

if (process.argv[1] !== undefined && realpathSync(process.argv[1]) === import.meta.filename) {
  main(process.argv.slice(2));
}
