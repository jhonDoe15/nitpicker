import {
  isDevelopmentGroup,
  normalizeRequirementName,
  requirementName,
} from '../../../libraries/python-dependencies.mjs';
import { addTableEntry, addToArray } from './toml-edits.mjs';
import { arrayElements, scanToml } from './toml-scan.mjs';

const POETRY_GROUP = /^tool\.poetry\.group\.([^.]+)\.dependencies$/u;
const POETRY_FIRST = 'tool.poetry.dependencies';
const POETRY_DEV = [
  POETRY_FIRST,
  'tool.poetry.dev-dependencies',
  'tool.poetry.group.dev.dependencies',
];

const PRODUCTION = 'production';
const PROJECT = 'project';
const DEPENDENCIES = 'dependencies';

function entriesOfArray(text, key, group) {
  return (arrayElements(text, key)?.elements ?? []).flatMap((element, index) => {
    const name = requirementName(element.value);
    return name === undefined
      ? []
      : [
          {
            kind: 'array',
            group,
            key,
            index,
            normalized: normalizeRequirementName(name),
            raw: element.raw,
          },
        ];
  });
}

function entriesOfTable(text, section, group) {
  return section.keys
    .filter(({ key }) => key.toLowerCase() !== 'python')
    .map((key) => ({
      kind: 'table',
      group,
      key,
      normalized: normalizeRequirementName(key.key),
      raw: text.slice(key.lineStart, key.lineEnd).trim(),
    }));
}

function sectionEntries(text, section) {
  const { name, keys } = section;
  function arrays(group) {
    return (key) => entriesOfArray(text, key, group(key));
  }
  if (name === PROJECT) {
    return keys.filter(({ key }) => key === DEPENDENCIES).flatMap(arrays(() => PRODUCTION));
  }
  if (name === 'project.optional-dependencies') {
    return keys.flatMap(arrays(({ key }) => (isDevelopmentGroup(key) ? 'dev' : 'optional')));
  }
  if (name === 'dependency-groups' || name === 'tool.pdm.dev-dependencies') {
    return keys.flatMap(arrays(() => 'dev'));
  }
  if (name === 'tool.uv') {
    return keys.filter(({ key }) => key === 'dev-dependencies').flatMap(arrays(() => 'dev'));
  }
  if (name === POETRY_FIRST) {
    return entriesOfTable(text, section, PRODUCTION);
  }
  const poetryGroup = POETRY_GROUP.exec(name)?.[1];
  if (name === 'tool.poetry.dev-dependencies' || poetryGroup !== undefined) {
    return entriesOfTable(text, section, poetryGroup === 'main' ? PRODUCTION : 'dev');
  }
  return [];
}

export function declaredEntries(text) {
  return scanToml(text).flatMap((section) => sectionEntries(text, section));
}

function arrayKey(sections, sectionName, keyName) {
  return sections.find(({ name }) => name === sectionName)?.keys.find(({ key }) => key === keyName);
}

export function addDependency(text, { name, version, development }) {
  const sections = scanToml(text);
  const requirement = `${name}>=${version}`;
  const tableLine = `${name} = ">=${version}"`;
  const arrayTargets = development
    ? [
        ['dependency-groups', 'dev'],
        ['tool.uv', 'dev-dependencies'],
      ]
    : [[PROJECT, DEPENDENCIES]];
  for (const [sectionName, keyName] of arrayTargets) {
    const key = arrayKey(sections, sectionName, keyName);
    const edit = key === undefined ? undefined : addToArray(text, key, requirement);
    if (edit !== undefined) {
      return edit;
    }
  }
  const tables = development ? POETRY_DEV.slice(2).concat(POETRY_DEV[1]) : [POETRY_FIRST];
  const table = tables
    .map((tableName) => sections.find(({ name: found }) => found === tableName))
    .find(Boolean);
  return table === undefined ? undefined : addTableEntry(text, table, tableLine);
}

export function addRaw(text, entry) {
  const sections = scanToml(text);
  const key = arrayKey(sections, PROJECT, DEPENDENCIES);
  if (entry.kind === 'array' && key !== undefined) {
    return addToArray(text, key, entry.raw);
  }
  const table = sections.find(({ name }) => name === POETRY_FIRST);
  return entry.kind === 'table' && table !== undefined
    ? addTableEntry(text, table, entry.raw)
    : undefined;
}
