import { readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { escapeRegExp } from '../typed/regex-views.mts';
import {
  fieldOf,
  listOf,
  fieldsOf,
  optionalText,
  parseJson,
  textOf,
  textsOf,
} from '../../../../shared/values/readers.mts';

export type ToolValues = Readonly<Record<string, unknown>>;
type ToolSpec = {
  readonly launcher: string | undefined;
  readonly args: string[];
  readonly accept: {
    readonly exits: number[] | undefined;
    readonly report: string | undefined;
    readonly reportPattern: string | undefined;
  };
};

const TOOL_COMMANDS_FILE = path.join(import.meta.dirname, 'tool-commands.json');

function isNumber(value: unknown): value is number {
  return typeof value === 'number';
}

function expanded(token: unknown, values: ToolValues): string[] {
  if (typeof token === 'string') {
    return [token];
  }
  const each = optionalText(fieldOf(token, 'each'));
  const flag = optionalText(fieldOf(token, 'flag'));
  if (each !== undefined) {
    return textsOf(values[each]).flatMap((value) => (flag === undefined ? [value] : [flag, value]));
  }
  const join = optionalText(fieldOf(token, 'join'));
  const separator = optionalText(fieldOf(token, 'separator'));
  const value =
    join === undefined
      ? textOf(values[optionalText(fieldOf(token, 'value')) ?? ''])
      : textsOf(values[join]).join(separator === 'path' ? path.delimiter : separator);
  return [`${optionalText(fieldOf(token, 'prefix')) ?? ''}${value}`];
}

function commandOf(tool: string): unknown {
  return fieldOf(parseJson(readFileSync(TOOL_COMMANDS_FILE, 'utf8')), tool);
}

export function reportRootPattern(tool: string): RegExp | undefined {
  const root = optionalText(fieldOf(fieldOf(commandOf(tool), 'accept'), 'root'));
  return root === undefined ? undefined : new RegExp(`<${escapeRegExp(root)}[\\s/>]`, 'u');
}

function wroteReport(file: string, rootPattern: string | undefined): boolean {
  if (statSync(file, { throwIfNoEntry: false })?.isFile() !== true) {
    return false;
  }
  return rootPattern === undefined || new RegExp(rootPattern, 'u').test(readFileSync(file, 'utf8'));
}

function commandSpec(tool: string, values: ToolValues): ToolSpec {
  const command = commandOf(tool);
  const accept = fieldOf(command, 'accept');
  const exitsValue = fieldOf(accept, 'exits');
  const report = optionalText(fieldOf(accept, 'report'));
  const launcher = optionalText(fieldOf(command, 'launcher'));
  return {
    launcher:
      launcher === undefined ? undefined : path.resolve(path.dirname(TOOL_COMMANDS_FILE), launcher),
    args: listOf(fieldOf(command, 'args')).flatMap((token) => expanded(token, values)),
    accept: {
      exits: Array.isArray(exitsValue) ? listOf(exitsValue).filter(isNumber) : undefined,
      report: report === undefined ? undefined : optionalText(values[report]),
      reportPattern: reportRootPattern(tool)?.source,
    },
  };
}

export function toolCommand(
  tool: string,
  values: ToolValues,
): {
  readonly launcher: string | undefined;
  readonly args: string[];
  readonly accepts: (status: unknown) => boolean;
} {
  const { launcher, args, accept } = commandSpec(tool, values);
  return {
    launcher,
    args,
    accepts: (status) =>
      (accept.exits === undefined || accept.exits.some((code) => code === status)) &&
      (accept.report === undefined || wroteReport(accept.report, accept.reportPattern)),
  };
}

export function main(args: readonly string[]): void {
  const [tool = '', valuesFile = '', outputFile = ''] = args;
  const values = parseJson(readFileSync(valuesFile, 'utf8'));
  writeFileSync(outputFile, JSON.stringify(commandSpec(tool, fieldsOf(values))));
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href
) {
  main(process.argv.slice(2));
}
