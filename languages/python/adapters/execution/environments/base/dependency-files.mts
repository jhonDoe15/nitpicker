import { insideProject } from '../../../../libraries/project-files.mts';
import { parseToml } from '../../../configuration/project-files.mts';
import { fieldOf } from '../../../../../../shared/values/readers.mts';
import { existsSync, readdirSync, readFileSync } from 'node:fs';

const FIXED_FILES = ['uv.lock', 'poetry.lock', 'pdm.lock', 'Pipfile', 'Pipfile.lock'];
const REQUIREMENTS_FILE = /^(?:requirements|constraints)[\w.-]*\.txt$/;
const REQUIREMENTS_FOLDER = 'requirements';
const PYPROJECT = 'pyproject.toml';
const DEPENDENCY_TABLES = [
  ['project', 'dependencies'],
  ['project', 'optional-dependencies'],
  ['project', 'requires-python'],
  ['dependency-groups'],
  ['build-system'],
  ['tool', 'poetry', 'dependencies'],
  ['tool', 'poetry', 'dev-dependencies'],
  ['tool', 'poetry', 'group'],
  ['tool', 'poetry', 'extras'],
  ['tool', 'uv'],
  ['tool', 'pdm', 'dev-dependencies'],
  ['tool', 'pdm', 'resolution'],
];

function tableAt(document: unknown, keys: readonly string[]): unknown {
  return keys.reduce((table: unknown, key) => fieldOf(table, key), document);
}

function pyprojectDependencies(text: string): string {
  const parsed = parseToml(text);
  if (parsed.kind === 'invalid') {
    return JSON.stringify({ unparsed: text, reason: String(parsed.error) });
  }
  return JSON.stringify(DEPENDENCY_TABLES.map((keys) => tableAt(parsed.table, keys)));
}

function requirementsFiles(root: string): string[] {
  const folder = insideProject(root, REQUIREMENTS_FOLDER);
  const inFolder = existsSync(folder)
    ? readdirSync(folder)
        .filter((name) => name.endsWith('.txt'))
        .map((name) => `${REQUIREMENTS_FOLDER}/${name}`)
    : [];
  const atRoot = readdirSync(root).filter((name) => REQUIREMENTS_FILE.test(name));
  return [...atRoot, ...inFolder];
}

export function dependencyFiles(root: string): string[] {
  const files = [
    ...FIXED_FILES.filter((name) => existsSync(insideProject(root, name))),
    ...requirementsFiles(root),
  ];
  return files.toSorted();
}

function dependencyDigest(root: string): [string, string][] {
  const entries: [string, string][] = dependencyFiles(root).map((name) => [
    name,
    readFileSync(insideProject(root, name), 'utf8'),
  ]);
  const pyproject = insideProject(root, PYPROJECT);
  if (existsSync(pyproject)) {
    entries.push([PYPROJECT, pyprojectDependencies(readFileSync(pyproject, 'utf8'))]);
  }
  return entries;
}

export function dependenciesDiffer(projectRoot: string, liveRoot: string): boolean {
  return (
    JSON.stringify(dependencyDigest(projectRoot)) !== JSON.stringify(dependencyDigest(liveRoot))
  );
}
