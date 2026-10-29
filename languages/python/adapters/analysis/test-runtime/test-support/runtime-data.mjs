import { evaluateTestRuntime } from '../../../../../../shared/rules/test-runtime/evaluate.mjs';
import { analyzePythonTestRuntime } from '../python-test-runtime.mjs';

const NO_MODULE = JSON.parse('null');

function dotted(file) {
  return file
    .replace(/\.py$/u, '')
    .replace(/\/__init__$/u, '')
    .replaceAll('/', '.');
}

function production(name) {
  return { file: `src/${name.replaceAll('.', '/')}.py`, module: name, isPackage: false };
}

export function other(file, kind = 'test') {
  return { file, module: dotted(file), kind, inRoots: false };
}

export function absolute(moduleName, ...names) {
  return { level: 0, module: moduleName, names };
}

export function plain(...names) {
  return { level: 0, module: NO_MODULE, names };
}

export function relative(level, moduleName, ...names) {
  return { level, module: moduleName, names };
}

export function typeOnly(statement) {
  return { ...statement, typeOnly: true };
}

export const OPTIONS = { pythonFiles: ['test_*.py', '*_test.py'], testpaths: [], django: false };
export const SERVICE = production('app.service');
const CLIENT = production('app.client');

export function productionAt(file) {
  return { file, module: dotted(file), isPackage: file.endsWith('__init__.py') };
}

export function scanned(found = {}) {
  return { strings: [], plugins: [], fixtures: [], requests: [], marks: [], ...found };
}

export function fixture(name, requests = [], autouse = false) {
  return { name, autouse, requests };
}

export function analyze({
  others,
  modules = [SERVICE, CLIENT],
  imports = {},
  literals = {},
  runner = 'pytest',
  options,
}) {
  return analyzePythonTestRuntime({
    modules,
    others,
    imports,
    literals,
    options: options ?? OPTIONS,
    runner,
  });
}

export function categories(report) {
  return Object.fromEntries(report.tests.map(({ test, category }) => [test, category]));
}

export function messageOf(rule) {
  return evaluateTestRuntime(
    { findings: [{ test: 'any.py', category: rule }] },
    'test-runtime',
  ).find(({ classification }) => classification === 'enforceable').message;
}
