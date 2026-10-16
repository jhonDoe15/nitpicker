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

function readQuietly(read, root) {
  try {
    return read(root);
  } catch {
    return undefined;
  }
}

export function projectConfigFor({ formatter, precedence, policyRoot }) {
  const { read, looked } = READERS[formatter];
  const layers = precedenceLayers(precedence);
  if (!layers.usesProject) {
    return { optedIn: false, project: readQuietly(read, policyRoot), wins: () => false };
  }
  const project = read(policyRoot);
  if (project === undefined) {
    throw new Error(missingProjectConfig(formatter, looked(policyRoot)));
  }
  return {
    optedIn: true,
    project,
    wins: (key) => project.set[key] !== undefined && !layers.nitpickerFirst,
  };
}
