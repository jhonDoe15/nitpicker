import {
  missingProjectConfig as untypedMissing,
  precedenceLayers as untypedLayers,
} from '../../../../shared/conventions/tool-precedence.mjs';
import { PYTHON_SETTING_IDS } from '../../conventions/python-conventions.mts';
import { fieldsOf, textOf } from '../../../../shared/values/readers.mts';
import { readBlackConfig, readRuffConfig } from './project-format-config.mts';
import type {
  BlackConfig,
  Conventions,
  FormatSet,
  ProjectChoice,
  ProjectRequest,
  RuffConfig,
  SettingKey,
} from './format-types.mts';

const missingProjectConfig: (tool: string, looked: string) => string = untypedMissing;
const precedenceLayers: (precedence: string[] | undefined) => {
  usesProject: boolean;
  nitpickerFirst: boolean;
} = untypedLayers;

const DOUBLE = 'double';
const DEFAULTS: Readonly<Record<SettingKey, string>> = {
  lineLength: '88',
  quotes: DOUBLE,
  indentation: '4',
};
const SHELL_WORD = /^[\w./=:@%+-]+$/;
export const EMPTY_FILE = '<empty file>';
const READERS = {
  ruff: {
    read: readRuffConfig,
    looked: (root: string): string =>
      `a ruff config (.ruff.toml, ruff.toml, or pyproject.toml with a [tool.ruff] table; searched ${root} and its parents)`,
  },
  black: {
    read: readBlackConfig,
    looked: (root: string): string => `a pyproject.toml (searched ${root} and its parents)`,
  },
};

export function followed(conventions: Conventions, key: SettingKey): string {
  return textOf(conventions[PYTHON_SETTING_IDS[key]] ?? DEFAULTS[key]);
}

function shellWord(word: string): string {
  return SHELL_WORD.test(word) || word === EMPTY_FILE
    ? word
    : `'${word.replaceAll("'", String.raw`'\''`)}'`;
}

export function shellCommand(words: readonly string[]): string {
  return words.map(shellWord).join(' ');
}

function readScope<Config>(
  read: (root: string) => Config | undefined,
  root: string,
): { project?: Config | undefined; failure?: unknown } {
  try {
    return { project: read(root) };
  } catch (error) {
    return { failure: error };
  }
}

const COMPARABLE_QUOTES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  ruff: { double: DOUBLE, single: 'single' },
  black: { normalize: DOUBLE },
};

function agrees(
  { formatter, conventions }: { formatter: string; conventions: Conventions },
  key: SettingKey,
  value: string | number,
): boolean {
  const followedValue = conventions[PYTHON_SETTING_IDS[key]];
  if (followedValue === undefined) {
    return true;
  }
  if (key === 'quotes') {
    const comparable = COMPARABLE_QUOTES[formatter]?.[value];
    return comparable === undefined || comparable === followedValue;
  }
  return followedValue === String(value);
}

type Reader<Config> = {
  readonly read: (root: string) => Config | undefined;
  readonly looked: (root: string) => string;
};

function chooseProject<Config extends { readonly set: FormatSet }>(
  { read, looked }: Reader<Config>,
  { formatter, precedence, policyRoot, conventions }: ProjectRequest & { conventions: Conventions },
): ProjectChoice<Config> {
  const layers = precedenceLayers(precedence);
  if (!layers.usesProject) {
    return { optedIn: false, project: readScope(read, policyRoot).project, wins: () => false };
  }
  const project = read(policyRoot);
  if (project === undefined) {
    throw new Error(missingProjectConfig(formatter, looked(policyRoot)));
  }
  return {
    optedIn: true,
    project,
    wins: (key) =>
      project.set[key] !== undefined &&
      !layers.nitpickerFirst &&
      agrees({ formatter, conventions }, key, project.set[key]),
  };
}

export function ruffProject(request: ProjectRequest): ProjectChoice<RuffConfig> {
  return chooseProject(READERS.ruff, { ...request, conventions: fieldsOf(request.conventions) });
}

export function blackProject(request: ProjectRequest): ProjectChoice<BlackConfig> {
  return chooseProject(READERS.black, { ...request, conventions: fieldsOf(request.conventions) });
}

export function projectConfigFor(
  request: ProjectRequest,
): ProjectChoice<RuffConfig> | ProjectChoice<BlackConfig> {
  if (request.formatter === 'black') {
    return blackProject(request);
  }
  if (request.formatter === 'ruff') {
    return ruffProject(request);
  }
  throw new Error(`Unknown formatter: ${request.formatter}`);
}
