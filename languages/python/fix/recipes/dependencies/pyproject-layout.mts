import {
  isDevelopmentGroup,
  normalizeRequirementName,
  requirementName,
} from '../../../libraries/python-dependencies.mts';
import type { DeclaredEntry, TextEdit, TomlKey, TomlSection } from '../../typed/fix-types.mts';
import { addTableEntry, addToArray } from './toml-edits.mts';
import { arrayElements, scanToml } from './toml-scan.mts';

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

function entriesOfArray(text: string, key: TomlKey, group: string): DeclaredEntry[] {
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

function entriesOfTable(text: string, section: TomlSection, group: string): DeclaredEntry[] {
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

function sectionEntries(text: string, section: TomlSection): DeclaredEntry[] {
  const { name, keys } = section;
  function arrays(group: (key: TomlKey) => string): (key: TomlKey) => DeclaredEntry[] {
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

export function declaredEntries(text: string): DeclaredEntry[] {
  return scanToml(text).flatMap((section) => sectionEntries(text, section));
}

function arrayKey(
  sections: TomlSection[],
  sectionName: string,
  keyName: string,
): TomlKey | undefined {
  return sections.find(({ name }) => name === sectionName)?.keys.find(({ key }) => key === keyName);
}

export function addDependency(
  text: string,
  { name, version, development }: { name: string; version: string; development: boolean },
): TextEdit | undefined {
  const sections = scanToml(text);
  const requirement = `${name}>=${version}`;
  const tableLine = `${name} = ">=${version}"`;
  const arrayTargets: [string, string][] = development
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
  const tables = development ? POETRY_DEV.slice(2).concat(POETRY_DEV.slice(1, 2)) : [POETRY_FIRST];
  const table = tables
    .map((tableName) => sections.find(({ name: found }) => found === tableName))
    .find((found) => found !== undefined);
  return table === undefined ? undefined : addTableEntry(text, table, tableLine);
}

export function addRaw(
  text: string,
  entry: { kind: string; raw: string } | undefined,
): TextEdit | undefined {
  const sections = scanToml(text);
  const key = arrayKey(sections, PROJECT, DEPENDENCIES);
  if (entry === undefined) {
    return undefined;
  }
  if (entry.kind === 'array' && key !== undefined) {
    return addToArray(text, key, entry.raw);
  }
  const table = sections.find(({ name }) => name === POETRY_FIRST);
  return entry.kind === 'table' && table !== undefined
    ? addTableEntry(text, table, entry.raw)
    : undefined;
}
