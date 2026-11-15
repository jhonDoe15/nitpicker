import {
  isTable,
  readProjectFile,
  type TomlTable,
  tomlTable,
} from '../../adapters/configuration/project-files.mts';
import type { IniSections } from '../../adapters/configuration/ini-parser.mts';
import { fieldOf, listOf } from '../../../../shared/values/readers.mts';
import { parseIni } from './typed/ini-views.mts';

const PRIVATE_CLASSIFIER = 'Private :: Do Not Upload';
const PROJECT = 'project';
const SCRIPTS = 'scripts';
const POETRY = 'poetry';
const PYPROJECT = 'pyproject.toml';
const SETUP_CFG = 'setup.cfg';
const SETUP_PY = 'setup.py';
const OBJECT_REFERENCE = /^([A-Za-z_][\w.]*)(?:\s*:\s*([A-Za-z_][\w.]*))?(?:\s*\[[^\]]*\])?$/u;
const DECLARED_ENTRY = /^\s*[^=[#\s][^=[#]*=(.*)$/u;
const STRING_LITERAL = /(["'])((?:\\.|(?!\1)[^\\\n])*)\1/gu;
const SETUP_CALL = /\bsetup\s*\(/u;
const NAME_ARGUMENT = /\bname\s*=/u;

function at(value: unknown, ...keys: string[]): unknown {
  return keys.reduce((current, key) => fieldOf(current, key), value);
}

function valuesOf(table: unknown): unknown[] {
  return isTable(table)
    ? Object.values(table).map((value) => (isTable(value) ? value['reference'] : value))
    : [];
}

function groupsOf(table: unknown): unknown[] {
  return isTable(table) ? Object.values(table).flatMap((group) => valuesOf(group)) : [];
}

function pyprojectReferences(pyproject: TomlTable): unknown[] {
  return [
    ...valuesOf(at(pyproject, PROJECT, SCRIPTS)),
    ...valuesOf(at(pyproject, PROJECT, 'gui-scripts')),
    ...groupsOf(at(pyproject, PROJECT, 'entry-points')),
    ...valuesOf(at(pyproject, 'tool', POETRY, SCRIPTS)),
    ...groupsOf(at(pyproject, 'tool', POETRY, 'plugins')),
    ...valuesOf(at(pyproject, 'tool', 'flit', SCRIPTS)),
  ];
}

function declaredReferences(text: string): string[] {
  return text.split('\n').flatMap((line) => DECLARED_ENTRY.exec(line)?.slice(1) ?? []);
}

function setupCfgReferences(sections: IniSections): string[] {
  const points = sections.get('options.entry_points');
  return [...(points?.values() ?? [])].flatMap((block) => declaredReferences(block));
}

function setupPyReferences(text: string): string[] {
  return [...text.matchAll(STRING_LITERAL)]
    .flatMap(([, , value = '']) => declaredReferences(value))
    .filter((reference) => reference.includes(':'));
}

function packageTable(pyproject: TomlTable): unknown {
  const poetry = at(pyproject, 'tool', POETRY);
  const project = at(pyproject, PROJECT);
  if (typeof fieldOf(project, 'name') === 'string') {
    return project;
  }
  return typeof fieldOf(poetry, 'name') === 'string' && fieldOf(poetry, 'package-mode') !== false
    ? poetry
    : undefined;
}

function pyprojectPublished(pyproject: TomlTable): boolean {
  const table = packageTable(pyproject);
  const classifiers = listOf(fieldOf(table, 'classifiers'));
  return (
    table !== undefined &&
    typeof pyproject['build-system'] === 'object' &&
    !classifiers.includes(PRIVATE_CLASSIFIER)
  );
}

type SetupFiles = {
  sections: IniSections;
  setupPy?: string | undefined;
  setupCfg?: string | undefined;
};

function setupPublished({ sections, setupPy = '', setupCfg = '' }: SetupFiles): boolean {
  const named =
    (sections.get('metadata')?.get('name') ?? '') !== '' ||
    (SETUP_CALL.test(setupPy) && NAME_ARGUMENT.test(setupPy));
  return named && ![setupPy, setupCfg].some((text) => text.includes(PRIVATE_CLASSIFIER));
}

function referencesOf(texts: readonly unknown[]): RegExpExecArray[] {
  return texts
    .filter((text) => typeof text === 'string')
    .map((text) => OBJECT_REFERENCE.exec(text.trim()))
    .filter((match) => match !== null);
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

export type PackageFacts = {
  published: boolean;
  entryPoints: string[];
  entryModules: string[];
};

export function readPackageFacts(projectRoot: string): PackageFacts {
  const pyproject = tomlTable(projectRoot, PYPROJECT) ?? {};
  const setupCfg = readProjectFile(projectRoot, SETUP_CFG);
  const setupPy = readProjectFile(projectRoot, SETUP_PY);
  const sections = parseIni(setupCfg ?? '');
  const references = referencesOf([
    ...pyprojectReferences(pyproject),
    ...setupCfgReferences(sections),
    ...setupPyReferences(setupPy ?? ''),
  ]);
  const named = references.filter(([, , name]) => name !== undefined);
  return {
    published: pyprojectPublished(pyproject) || setupPublished({ sections, setupPy, setupCfg }),
    entryPoints: unique(named.map(([, module = '', name = '']) => `${module}:${name}`)),
    entryModules: unique(references.map(([, module = '']) => module)),
  };
}
