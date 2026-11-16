import { readProjectFile } from '../../libraries/project-files.mts';
import path from 'node:path';
import { importEdges } from '../analysis/python-coupling.mts';
import { readPythonDependencies } from '../../libraries/python-dependencies.mts';
import type { ImportStatement, ImportsReport } from '../analysis/typed/python-graph-types.mts';

type Allowance = { rules: ReadonlySet<string>; files: ReadonlySet<string> };

const DJANGO = 'django';
const FASTAPI = 'fastapi';
const FLASK = 'flask';
const FRAMEWORK_DISTRIBUTIONS = new Map([
  [DJANGO, DJANGO],
  ['djangorestframework', DJANGO],
  [FASTAPI, FASTAPI],
  [FLASK, FLASK],
]);
const FRAMEWORK_MODULES = new Map([
  [DJANGO, DJANGO],
  ['rest_framework', DJANGO],
  [FASTAPI, FASTAPI],
  [FLASK, FLASK],
]);
const IMPLIED_DISTRIBUTIONS = [
  { framework: DJANGO, marker: /\bImageField\b/u, names: ['pillow'] },
  { framework: DJANGO, marker: /\bRedisCache\b/u, names: ['redis', 'hiredis'] },
  { framework: DJANGO, marker: /\bPyMemcacheCache\b/u, names: ['pymemcache'] },
  { framework: DJANGO, marker: /\bPyLibMCCache\b/u, names: ['pylibmc'] },
  { framework: DJANGO, marker: /\bArgon2PasswordHasher\b/u, names: ['argon2-cffi'] },
  { framework: DJANGO, marker: /\bBCrypt(?:SHA256)?PasswordHasher\b/u, names: ['bcrypt'] },
  { framework: FASTAPI, marker: /\b(?:Form|File|UploadFile)\b/u, names: ['python-multipart'] },
  { framework: FLASK, marker: /^/u, names: ['python-dotenv'] },
  { marker: /\b(?:EmailStr|NameEmail)\b/u, names: ['email-validator'] },
];
const SETTINGS_ENTRY_FILES = ['manage.py', 'wsgi.py', 'asgi.py'];
const SETTINGS_MODULE = /DJANGO_SETTINGS_MODULE["']\s*,\s*["']([\w.]+)["']/gu;
const SETTINGS_NAME = /(?:^|\.)settings(?:\.|$)/u;
const SETTINGS_RULES = new Set(['process-env-access', 'import-time-effect', 'F403']);
const ROUTER_RULES = new Set(['pydantic-boundary']);
const ENTRY_POINT_RULES = new Set([
  'crap-coverage-unknown',
  'process-env-access',
  'import-time-effect',
]);

export function topLevelImports(statement: ImportStatement): string[] {
  if (statement.level !== 0) {
    return [];
  }
  const names = statement.module === null ? statement.names : [statement.module];
  return names.map((name) => name.split('.')[0] ?? '');
}

function topImports(statements: readonly ImportStatement[] = []): string[] {
  return statements.flatMap(topLevelImports);
}

export function detectFrameworks(projectRoot: string, imports: ImportsReport): Set<string> {
  const declared = readPythonDependencies(projectRoot).dependencies.flatMap(
    ({ normalized }) => FRAMEWORK_DISTRIBUTIONS.get(normalized) ?? [],
  );
  const imported = imports.modules.flatMap(({ file }) =>
    topImports(imports.imports[file]).flatMap((top) => FRAMEWORK_MODULES.get(top) ?? []),
  );
  return new Set([...declared, ...imported]);
}

function entryFiles(imports: ImportsReport): string[] {
  return [...new Set([...SETTINGS_ENTRY_FILES, ...entryPointFiles(imports)])];
}

function declaredSettings(projectRoot: string, imports: ImportsReport): Set<string> {
  return new Set(
    entryFiles(imports)
      .flatMap((file) => [...(readProjectFile(projectRoot, file) ?? '').matchAll(SETTINGS_MODULE)])
      .flatMap(([, module]) => module ?? []),
  );
}

function settingsFiles(projectRoot: string, imports: ImportsReport): Set<string> {
  const declared = declaredSettings(projectRoot, imports);
  return new Set(
    imports.modules
      .filter(({ module }) => isSettingsModule(module, declared))
      .map(({ file }) => file),
  );
}

function isSettingsModule(module: string, declared: ReadonlySet<string>): boolean {
  return (
    SETTINGS_NAME.test(module) ||
    [...declared].some((name) => module === name || module.startsWith(`${name}.`))
  );
}

function routerFiles(imports: ImportsReport): Set<string> {
  const routers = new Set(
    imports.modules
      .filter(({ file }) => topImports(imports.imports[file]).includes(FASTAPI))
      .map(({ module }) => module),
  );
  const reached = new Set(routers);
  for (const { source, target } of importEdges(imports.modules, imports.imports)) {
    if (routers.has(source)) {
      reached.add(target);
    }
  }
  return new Set(
    imports.modules.filter(({ module }) => reached.has(module)).map(({ file }) => file),
  );
}

function entryPointFiles(imports: ImportsReport): Set<string> {
  return new Set(
    imports.modules
      .map(({ file }) => file)
      .filter((file) => SETTINGS_ENTRY_FILES.includes(path.posix.basename(file))),
  );
}

function frameworkAllowances(projectRoot: string, imports: ImportsReport): Allowance[] {
  const frameworks = detectFrameworks(projectRoot, imports);
  const allowed: Allowance[] = [];
  if (frameworks.has(DJANGO)) {
    allowed.push({ rules: SETTINGS_RULES, files: settingsFiles(projectRoot, imports) });
    allowed.push({ rules: ENTRY_POINT_RULES, files: entryPointFiles(imports) });
  }
  if (frameworks.has(FASTAPI)) {
    allowed.push({ rules: ROUTER_RULES, files: routerFiles(imports) });
  }
  return allowed;
}

export function withoutFrameworkForms<Found extends { rule: string; path?: string | undefined }>(
  findings: readonly Found[],
  projectRoot: string,
  imports: ImportsReport,
): Found[] {
  const allowed = frameworkAllowances(projectRoot, imports);
  return findings.filter(
    (finding) =>
      !allowed.some(
        ({ rules, files }) =>
          rules.has(finding.rule) && finding.path !== undefined && files.has(finding.path),
      ),
  );
}

export function impliedDistributions(projectRoot: string, imports: ImportsReport): Set<string> {
  const frameworks = detectFrameworks(projectRoot, imports);
  const texts = [...imports.modules, ...(imports.others ?? [])].map(
    ({ file }) => readProjectFile(projectRoot, file) ?? '',
  );
  return new Set(
    IMPLIED_DISTRIBUTIONS.filter(
      ({ framework, marker }) =>
        (framework === undefined || frameworks.has(framework)) &&
        texts.some((text) => marker.test(text)),
    ).flatMap(({ names }) => names),
  );
}
