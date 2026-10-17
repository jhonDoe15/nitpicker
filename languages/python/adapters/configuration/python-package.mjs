import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const PRIVATE_CLASSIFIER = 'Private :: Do Not Upload';
const SCRIPT_TABLES = ['scripts', 'gui-scripts'];
const ENTRY_POINT = /^\s*([\w.]+)\s*:\s*([\w.]+)/;

function readPyproject(projectRoot) {
  const file = path.join(projectRoot, 'pyproject.toml');
  if (!existsSync(file)) {
    return {};
  }
  return createRequire(import.meta.url)('smol-toml').parse(readFileSync(file, 'utf8'));
}

function packageTable(pyproject) {
  const poetry = pyproject.tool?.poetry;
  if (typeof pyproject.project?.name === 'string') {
    return pyproject.project;
  }
  return typeof poetry?.name === 'string' && poetry['package-mode'] !== false ? poetry : undefined;
}

function isPublished(pyproject) {
  const table = packageTable(pyproject);
  const classifiers = Array.isArray(table?.classifiers) ? table.classifiers : [];
  return (
    table !== undefined &&
    typeof pyproject['build-system']?.['build-backend'] === 'string' &&
    !classifiers.includes(PRIVATE_CLASSIFIER)
  );
}

function isTable(value) {
  return typeof value === 'object' && value !== null;
}

function entryPointGroups(pyproject) {
  const groups = pyproject.project?.['entry-points'];
  return isTable(groups) ? Object.values(groups) : [];
}

function scriptReferences(pyproject) {
  const tables = [
    ...SCRIPT_TABLES.map((name) => pyproject.project?.[name]),
    pyproject.tool?.poetry?.scripts,
    ...entryPointGroups(pyproject),
  ];
  return tables
    .filter((table) => isTable(table))
    .flatMap((table) => Object.values(table))
    .map((value) => (typeof value === 'string' ? value : value?.reference))
    .filter((value) => typeof value === 'string');
}

function entryPoints(pyproject) {
  return scriptReferences(pyproject)
    .map((reference) => ENTRY_POINT.exec(reference))
    .filter((match) => match !== null)
    .map(([, module, name]) => `${module}:${name}`);
}

export function readPackageFacts(projectRoot) {
  const pyproject = readPyproject(projectRoot);
  return { published: isPublished(pyproject), entryPoints: entryPoints(pyproject) };
}
