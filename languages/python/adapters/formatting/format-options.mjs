import {
  missingProjectConfig,
  precedenceLayers,
} from '../../../../shared/conventions/tool-precedence.mjs';
import { PYTHON_SETTING_IDS } from '../../conventions/python-conventions.mjs';
import { readBlackConfig, readRuffConfig } from './project-format-config.mjs';

const DEFAULTS = { lineLength: '88', quotes: 'double', indentation: '4' };
const SHELL_WORD = /^[\w./=:@%+-]+$/;
export const EMPTY_FILE = '<empty file>';
const READERS = {
  ruff: {
    read: readRuffConfig,
    looked: (root) =>
      `a ruff config (.ruff.toml, ruff.toml, or pyproject.toml with a [tool.ruff] table; searched ${root} and its parents)`,
  },
  black: {
    read: readBlackConfig,
    looked: (root) => `a pyproject.toml (searched ${root} and its parents)`,
  },
};

export function followed(conventions, key) {
  return conventions[PYTHON_SETTING_IDS[key]] ?? DEFAULTS[key];
}

function shellWord(word) {
  return SHELL_WORD.test(word) || word === EMPTY_FILE
    ? word
    : `'${word.replaceAll("'", String.raw`'\''`)}'`;
}

export function shellCommand(words) {
  return words.map(shellWord).join(' ');
}

function readScope(read, root) {
  try {
    return { project: read(root) };
  } catch (error) {
    return { failure: error };
  }
}

const COMPARABLE_QUOTES = {
  ruff: { double: 'double', single: 'single' },
  black: { normalize: 'double' },
};

function agrees({ formatter, conventions }, key, value) {
  const followedValue = conventions[PYTHON_SETTING_IDS[key]];
  if (followedValue === undefined) {
    return true;
  }
  if (key === 'quotes') {
    const comparable = COMPARABLE_QUOTES[formatter][value];
    return comparable === undefined || comparable === followedValue;
  }
  return followedValue === String(value);
}

export function projectConfigFor({ formatter, precedence, policyRoot, conventions = {} }) {
  const { read, looked } = READERS[formatter];
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
