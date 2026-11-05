import {
  isTable,
  readProjectFile,
  tomlTable,
} from '../../adapters/configuration/project-files.mjs';
import { parseIni } from '../../adapters/configuration/pytest/ini-file.mjs';

const PRIVATE_CLASSIFIER = 'Private :: Do Not Upload';
const PYPROJECT = 'pyproject.toml';
const SETUP_CFG = 'setup.cfg';
const SETUP_PY = 'setup.py';
const OBJECT_REFERENCE = /^([A-Za-z_][\w.]*)(?:\s*:\s*([A-Za-z_][\w.]*))?(?:\s*\[[^\]]*\])?$/u;
const DECLARED_ENTRY = /^\s*[^=[#\s][^=[#]*=(.*)$/u;
const STRING_LITERAL = /(["'])((?:\\.|(?!\1)[^\\\n])*)\1/gu;
const SETUP_CALL = /\bsetup\s*\(/u;
const NAME_ARGUMENT = /\bname\s*=/u;

function valuesOf(table) {
  return isTable(table)
    ? Object.values(table).map((value) => (isTable(value) ? value.reference : value))
    : [];
}

function groupsOf(table) {
  return isTable(table) ? Object.values(table).flatMap((group) => valuesOf(group)) : [];
}

function pyprojectReferences(pyproject) {
  return [
    ...valuesOf(pyproject.project?.scripts),
    ...valuesOf(pyproject.project?.['gui-scripts']),
    ...groupsOf(pyproject.project?.['entry-points']),
    ...valuesOf(pyproject.tool?.poetry?.scripts),
    ...groupsOf(pyproject.tool?.poetry?.plugins),
    ...valuesOf(pyproject.tool?.flit?.scripts),
  ];
}

function declaredReferences(text) {
  return text.split('\n').flatMap((line) => DECLARED_ENTRY.exec(line)?.slice(1) ?? []);
}

function setupCfgReferences(sections) {
  const points = sections.get('options.entry_points');
  return [...(points?.values() ?? [])].flatMap((block) => declaredReferences(block));
}

function setupPyReferences(text) {
  return [...text.matchAll(STRING_LITERAL)]
    .flatMap(([, , value]) => declaredReferences(value))
    .filter((reference) => reference.includes(':'));
}

function packageTable(pyproject) {
  const poetry = pyproject.tool?.poetry;
  if (typeof pyproject.project?.name === 'string') {
    return pyproject.project;
  }
  return typeof poetry?.name === 'string' && poetry['package-mode'] !== false ? poetry : undefined;
}

function pyprojectPublished(pyproject) {
  const table = packageTable(pyproject);
  const classifiers = Array.isArray(table?.classifiers) ? table.classifiers : [];
  return (
    table !== undefined &&
    typeof pyproject['build-system'] === 'object' &&
    !classifiers.includes(PRIVATE_CLASSIFIER)
  );
}

function setupPublished({ sections, setupPy = '', setupCfg = '' }) {
  const named =
    (sections.get('metadata')?.get('name') ?? '') !== '' ||
    (SETUP_CALL.test(setupPy) && NAME_ARGUMENT.test(setupPy));
  return named && ![setupPy, setupCfg].some((text) => text.includes(PRIVATE_CLASSIFIER));
}

function referencesOf(texts) {
  return texts
    .filter((text) => typeof text === 'string')
    .map((text) => OBJECT_REFERENCE.exec(text.trim()))
    .filter((match) => match !== null);
}

function unique(values) {
  return [...new Set(values)].sort();
}

export function readPackageFacts(projectRoot) {
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
    entryPoints: unique(named.map(([, module, name]) => `${module}:${name}`)),
    entryModules: unique(references.map(([, module]) => module)),
  };
}
