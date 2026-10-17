import {
  isTable,
  parseToml,
  readProjectFile,
  tomlProblem,
} from '../../adapters/configuration/project-files.mjs';

const PRIVATE_CLASSIFIER = 'Private :: Do Not Upload';
const SCRIPT_TABLES = ['scripts', 'gui-scripts'];
const ENTRY_POINT = /^\s*([\w.]+)\s*:\s*([\w.]+)/;

const PYPROJECT = 'pyproject.toml';

function readPyproject(projectRoot) {
  const text = readProjectFile(projectRoot, PYPROJECT);
  const parsed = text === undefined ? undefined : parseToml(text);
  if (parsed?.kind === 'invalid') {
    const problem = tomlProblem(parsed.error);
    return {
      pyproject: {},
      invalidFiles: [{ file: PYPROJECT, line: parsed.error?.line ?? 1, problem }],
    };
  }
  return { pyproject: parsed?.table ?? {}, invalidFiles: [] };
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
  const { pyproject, invalidFiles } = readPyproject(projectRoot);
  return { published: isPublished(pyproject), entryPoints: entryPoints(pyproject), invalidFiles };
}
