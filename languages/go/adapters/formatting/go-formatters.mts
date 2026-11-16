import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { firstFileIn as untypedFirstFileIn } from '../../../../shared/filesystem.mjs';
import { GO_TOOLS } from '../execution/go-tools.mts';
import { GO_MOD, readGoModule } from '../execution/go-module.mts';
import {
  fieldOf,
  fieldsOf,
  listOf as readList,
  messageOf,
  parseJson,
} from '../../../../shared/values/readers.mts';
import type { Fields } from '../../../../shared/values/readers.mts';
import type { GoFormatting } from '../go-types.mts';

type Golangci = { name: string; config: Fields };
type OptionReader = (settings: Fields) => string[];

const firstFileIn: (root: string, names: readonly string[]) => string | undefined =
  untypedFirstFileIn;
const GOFMT = 'gofmt';

export const FORMATTERS = [GOFMT, 'gofumpt', 'goimports'];
export const GOLANGCI_FILES = [
  '.golangci.yml',
  '.golangci.yaml',
  '.golangci.toml',
  '.golangci.json',
];
const load = createRequire(import.meta.url);

function parseWith(moduleName: string, text: string): unknown {
  const parser: unknown = load(moduleName);
  const parse = fieldOf(parser, 'parse');
  if (typeof parse !== 'function') {
    throw new TypeError(`${moduleName} has no parse`);
  }
  return Reflect.apply(parse, parser, [text]);
}

const PARSERS: Readonly<Record<string, (text: string) => unknown>> = {
  '.toml': (text) => parseWith('smol-toml', text),
  '.json': (text) => parseJson(text),
};

function parseYaml(text: string): unknown {
  return parseWith('yaml', text);
}

function readGolangci(projectRoot: string): Golangci | undefined {
  const file = firstFileIn(projectRoot, GOLANGCI_FILES);
  if (file === undefined) {
    return undefined;
  }
  const name = path.basename(file);
  const parse = PARSERS[path.extname(name)] ?? parseYaml;
  try {
    return { name, config: fieldsOf(parse(readFileSync(file, 'utf8'))) };
  } catch (error) {
    throw Object.assign(
      new Error(`${name} could not be read: ${messageOf(error)}. Fix its syntax.`, {
        cause: error,
      }),
      { rule: 'golangci-config-invalid' },
    );
  }
}

function enabledIn(section: unknown): string[] {
  return readList(fieldOf(section, 'enable')).filter((name) => typeof name === 'string');
}

function listOf(value: unknown): string[] {
  if (Array.isArray(value)) {
    return readList(value).filter(
      (entry): entry is string => typeof entry === 'string' && entry !== '',
    );
  }
  return typeof value === 'string' && value !== ''
    ? value.split(',').map((entry) => entry.trim())
    : [];
}

function formatterSettings(config: Fields, formatter: string): Fields {
  return fieldsOf(
    fieldOf(fieldOf(fieldOf(config, 'formatters'), 'settings'), formatter) ??
      fieldOf(fieldOf(config, 'linters-settings'), formatter),
  );
}

const OPTION_READERS: Readonly<Record<string, OptionReader>> = {
  [GOFMT]: () => [],
  goimports: (settings) => {
    const prefixes = listOf(settings['local-prefixes']);
    return prefixes.length === 0 ? [] : ['-local', prefixes.join(',')];
  },
  gofumpt: (settings) => [
    ...(settings['extra-rules'] === true ? ['-extra'] : []),
    ...(typeof settings['module-path'] === 'string' ? ['-modpath', settings['module-path']] : []),
  ],
};

export function formatterOptions(
  projectRoot: string,
  formatter: string,
  precedence: readonly string[] = [],
): string[] {
  const golangci = precedence.includes('project') ? readGolangci(projectRoot) : undefined;
  return golangci === undefined
    ? []
    : (OPTION_READERS[formatter]?.(formatterSettings(golangci.config, formatter)) ?? []);
}

export function formatterChoiceFiles(policyRoot: string): string[] {
  return [...GOLANGCI_FILES, GO_MOD].map((file) => path.join(policyRoot, file));
}

function golangciFormatters(projectRoot: string): GoFormatting | undefined {
  const golangci = readGolangci(projectRoot);
  if (golangci === undefined) {
    return undefined;
  }
  const formatters = fieldOf(golangci.config, 'formatters');
  const linters = fieldOf(golangci.config, 'linters');
  const enabled = [...enabledIn(formatters), ...enabledIn(linters)];
  const chosen = FORMATTERS.filter((name) => enabled.includes(name));
  return chosen.length === 0 ? undefined : { formatters: chosen, from: golangci.name };
}

function toolDirectiveFormatters(projectRoot: string): GoFormatting | undefined {
  const tools = readGoModule(projectRoot)?.tools ?? [];
  const chosen = FORMATTERS.filter((name) => tools.includes(GO_TOOLS[name]?.module ?? ''));
  return chosen.length === 0
    ? undefined
    : { formatters: chosen, from: 'the tool directives in go.mod' };
}

function strongest(formatters: readonly string[]) {
  const stricter = formatters.filter((name) => name !== GOFMT);
  return stricter.length === 0 ? [GOFMT] : stricter;
}

export function detectFormatters(projectRoot: string, setting?: readonly string[]): GoFormatting {
  const chosen: GoFormatting = (setting === undefined
    ? undefined
    : { formatters: setting, from: '"go.formatters"' }) ??
    toolDirectiveFormatters(projectRoot) ??
    golangciFormatters(projectRoot) ?? { formatters: [GOFMT], from: undefined };
  return { ...chosen, formatters: strongest(chosen.formatters) };
}
