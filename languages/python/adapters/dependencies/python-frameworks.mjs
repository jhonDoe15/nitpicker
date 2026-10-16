import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { importEdges } from '../analysis/python-coupling.mjs';
import { readPythonDependencies } from '../../libraries/python-dependencies.mjs';

const FRAMEWORK_DISTRIBUTIONS = new Map([
  ['django', 'django'],
  ['djangorestframework', 'django'],
  ['fastapi', 'fastapi'],
  ['flask', 'flask'],
]);
const FRAMEWORK_MODULES = new Map([
  ['django', 'django'],
  ['rest_framework', 'django'],
  ['fastapi', 'fastapi'],
  ['flask', 'flask'],
]);
const SETTINGS_ENTRY_FILES = ['manage.py', 'wsgi.py', 'asgi.py'];
const SETTINGS_MODULE = /DJANGO_SETTINGS_MODULE["']\s*,\s*["']([\w.]+)["']/gu;
const SETTINGS_NAME = /(?:^|\.)settings(?:\.|$)/u;
const SETTINGS_RULES = new Set(['process-env-access', 'F403']);
const ROUTER_RULES = new Set(['pydantic-boundary']);
const ENTRY_POINT_RULES = new Set(['crap-coverage-unknown', 'process-env-access']);

function topImports(statements = []) {
  return statements.flatMap((statement) => {
    if (statement.level !== 0) return [];
    const names = statement.module === null ? statement.names : [statement.module];
    return names.map((name) => name.split('.')[0]);
  });
}

export function detectFrameworks(projectRoot, imports) {
  const declared = readPythonDependencies(projectRoot).dependencies.flatMap(({ normalized }) =>
    FRAMEWORK_DISTRIBUTIONS.has(normalized) ? [FRAMEWORK_DISTRIBUTIONS.get(normalized)] : [],
  );
  const imported = imports.modules.flatMap(({ file }) =>
    topImports(imports.imports[file]).flatMap((top) =>
      FRAMEWORK_MODULES.has(top) ? [FRAMEWORK_MODULES.get(top)] : [],
    ),
  );
  return new Set([...declared, ...imported]);
}

function entryFiles(imports) {
  return [...new Set([...SETTINGS_ENTRY_FILES, ...entryPointFiles(imports)])];
}

function declaredSettings(projectRoot, imports) {
  return new Set(
    entryFiles(imports)
      .filter((file) => existsSync(path.join(projectRoot, file)))
      .flatMap((file) =>
        [...readFileSync(path.join(projectRoot, file), 'utf8').matchAll(SETTINGS_MODULE)].map(
          ([, module]) => module,
        ),
      ),
  );
}

function settingsFiles(projectRoot, imports) {
  const declared = declaredSettings(projectRoot, imports);
  const isSettings = (module) =>
    SETTINGS_NAME.test(module) ||
    [...declared].some((name) => module === name || module.startsWith(`${name}.`));
  return new Set(
    imports.modules.filter(({ module }) => isSettings(module)).map(({ file }) => file),
  );
}

function routerFiles(imports) {
  const routers = new Set(
    imports.modules
      .filter(({ file }) => topImports(imports.imports[file]).includes('fastapi'))
      .map(({ module }) => module),
  );
  const reached = new Set(routers);
  for (const { source, target } of importEdges(imports.modules, imports.imports)) {
    if (routers.has(source)) reached.add(target);
  }
  return new Set(
    imports.modules.filter(({ module }) => reached.has(module)).map(({ file }) => file),
  );
}

function entryPointFiles(imports) {
  return new Set(
    imports.modules
      .map(({ file }) => file)
      .filter((file) => SETTINGS_ENTRY_FILES.includes(path.posix.basename(file))),
  );
}

export function frameworkAllowances(projectRoot, imports) {
  const frameworks = detectFrameworks(projectRoot, imports);
  const allowed = [];
  if (frameworks.has('django')) {
    allowed.push({ rules: SETTINGS_RULES, files: settingsFiles(projectRoot, imports) });
    allowed.push({ rules: ENTRY_POINT_RULES, files: entryPointFiles(imports) });
  }
  if (frameworks.has('fastapi')) {
    allowed.push({ rules: ROUTER_RULES, files: routerFiles(imports) });
  }
  return allowed;
}

export function withoutFrameworkForms(findings, projectRoot, imports) {
  const allowed = frameworkAllowances(projectRoot, imports);
  return findings.filter(
    (finding) =>
      !allowed.some(({ rules, files }) => rules.has(finding.rule) && files.has(finding.path)),
  );
}
