import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  PYTHON_INDENTATION,
  PYTHON_LINE_LENGTH,
  PYTHON_QUOTES,
} from '../../conventions/python-conventions.mjs';

const RUFF_FILES = [
  ['.ruff.toml', ''],
  ['ruff.toml', ''],
  ['pyproject.toml', 'tool.ruff'],
];
const BLACK_FILES = [['pyproject.toml', 'tool.black']];
const SECTION = /^\s*\[\[?\s*([^\]]+?)\s*\]\]?\s*(?:#.*)?$/;
const ASSIGNMENT = /^\s*([A-Za-z0-9_.-]+)\s*=(.*)$/;
const INLINE_KEY = /([A-Za-z0-9_-]+)\s*=/g;
const RUFF_KEYS = {
  [PYTHON_LINE_LENGTH]: ['line-length'],
  [PYTHON_QUOTES]: ['format.quote-style'],
  [PYTHON_INDENTATION]: ['indent-width', 'format.indent-style'],
};
const BLACK_KEYS = {
  [PYTHON_LINE_LENGTH]: ['line-length'],
  [PYTHON_QUOTES]: ['skip-string-normalization'],
  [PYTHON_INDENTATION]: [],
};

function sectionWithin(name, prefix) {
  if (prefix === '') {
    return name;
  }
  if (name === prefix) {
    return '';
  }
  return name.startsWith(`${prefix}.`) ? name.slice(prefix.length + 1) : undefined;
}

function assignmentKeys(section, line) {
  const assignment = ASSIGNMENT.exec(line);
  if (section === undefined || assignment === null) {
    return [];
  }
  const name = (section === '' ? assignment[1] : `${section}.${assignment[1]}`).replaceAll(
    '_',
    '-',
  );
  const inner = [...assignment[2].matchAll(INLINE_KEY)].map(([, key]) => key.replaceAll('_', '-'));
  return [name, ...inner.map((key) => `${name}.${key}`)];
}

function keysIn(text, prefix) {
  const keys = [];
  let section = prefix === '' ? '' : undefined;
  for (const line of text.split(/\r?\n/)) {
    const header = SECTION.exec(line);
    section = header === null ? section : sectionWithin(header[1], prefix);
    keys.push(...(header === null ? assignmentKeys(section, line) : []));
  }
  return keys;
}

function projectKeys(projectRoot, files) {
  const present = files
    .map(([file, prefix]) => [path.join(projectRoot, file), prefix])
    .filter(([absolute]) => existsSync(absolute));
  return new Set(
    present.flatMap(([absolute, prefix]) => keysIn(readFileSync(absolute, 'utf8'), prefix)),
  );
}

function chosenByProject(keys, names) {
  return keys.has('extend') || names.some((name) => keys.has(name));
}

function conventionsToFollow(conventions, projectRoot, formatter) {
  const files = formatter === 'black' ? BLACK_FILES : RUFF_FILES;
  const names = formatter === 'black' ? BLACK_KEYS : RUFF_KEYS;
  const keys = projectKeys(projectRoot, files);
  return Object.fromEntries(
    Object.entries(names)
      .filter(([id]) => conventions[id] !== undefined && !chosenByProject(keys, names[id]))
      .map(([id]) => [id, conventions[id]]),
  );
}

function ruffArguments(followed) {
  return [
    ...(followed[PYTHON_LINE_LENGTH] === undefined
      ? []
      : ['--line-length', followed[PYTHON_LINE_LENGTH]]),
    ...(followed[PYTHON_QUOTES] === undefined
      ? []
      : ['--config', `format.quote-style = "${followed[PYTHON_QUOTES]}"`]),
    ...(followed[PYTHON_INDENTATION] === undefined
      ? []
      : ['--config', `indent-width = ${followed[PYTHON_INDENTATION]}`]),
  ];
}

function blackArguments(followed) {
  return [
    ...(followed[PYTHON_LINE_LENGTH] === undefined
      ? []
      : ['--line-length', followed[PYTHON_LINE_LENGTH]]),
    ...(followed[PYTHON_QUOTES] === 'single' ? ['--skip-string-normalization'] : []),
  ];
}

export function formatterConventionArguments({ formatter, conventions = {}, projectRoot }) {
  const followed = conventionsToFollow(conventions, projectRoot, formatter);
  return formatter === 'black' ? blackArguments(followed) : ruffArguments(followed);
}
