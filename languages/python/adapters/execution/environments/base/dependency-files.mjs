import { insideProject } from '../../../../libraries/project-files.mjs';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

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

function parseToml(text) {
  return createRequire(import.meta.url)('smol-toml').parse(text);
}

function tableAt(document, keys) {
  return keys.reduce((table, key) => table?.[key], document);
}

function pyprojectDependencies(text) {
  try {
    const document = parseToml(text);
    return JSON.stringify(DEPENDENCY_TABLES.map((keys) => tableAt(document, keys)));
  } catch (error) {
    return JSON.stringify({ unparsed: text, reason: String(error) });
  }
}

function requirementsFiles(root) {
  const folder = insideProject(root, REQUIREMENTS_FOLDER);
  const inFolder = existsSync(folder)
    ? readdirSync(folder)
        .filter((name) => name.endsWith('.txt'))
        .map((name) => `${REQUIREMENTS_FOLDER}/${name}`)
    : [];
  const atRoot = readdirSync(root).filter((name) => REQUIREMENTS_FILE.test(name));
  return [...atRoot, ...inFolder];
}

export function dependencyFiles(root) {
  const files = [
    ...FIXED_FILES.filter((name) => existsSync(insideProject(root, name))),
    ...requirementsFiles(root),
  ];
  return files.toSorted();
}

function dependencyDigest(root) {
  const entries = dependencyFiles(root).map((name) => [
    name,
    readFileSync(insideProject(root, name), 'utf8'),
  ]);
  const pyproject = insideProject(root, PYPROJECT);
  if (existsSync(pyproject)) {
    entries.push([PYPROJECT, pyprojectDependencies(readFileSync(pyproject, 'utf8'))]);
  }
  return entries;
}

export function dependenciesDiffer(projectRoot, liveRoot) {
  return (
    JSON.stringify(dependencyDigest(projectRoot)) !== JSON.stringify(dependencyDigest(liveRoot))
  );
}
