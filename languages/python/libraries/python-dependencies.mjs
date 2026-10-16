import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { parseIni } from '../adapters/configuration/mypy-config.mjs';

// The dependencies a Python project declares, and whether each is for production or development.
// Reads pyproject.toml (PEP 621 dependencies and optional-dependencies, [dependency-groups], uv,
// pdm, hatch environments and Poetry), Pipfile, requirements*.txt (and requirements/*.txt|in) and
// setup.cfg. Language-preset neutral: the dependency checks and the library detection share it.

const PYPROJECT = 'pyproject.toml';
const PIPFILE = 'Pipfile';
const SETUP_CFG = 'setup.cfg';
const REQUIREMENT_DIRECTORY = 'requirements';
const REQUIREMENT_FILE = /^requirements.*\.(?:txt|in)$/u;
const DEV_NAME =
  /(?:^|[-_.])(?:dev|develop|development|test|tests|testing|lint|linting|docs?|typing|types|ci|tox|check|qa|format|local)(?:$|[-_.])/u;
const REQUIREMENT_NAME = /^\s*([A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?)/u;
const EGG_NAME = /#egg=([A-Za-z0-9._-]+)/u;
const PYTHON_ENTRY = 'python';

/** PEP 503 normalized name: lower case, runs of `-`, `_` and `.` as one `-`. */
export function normalizeRequirementName(name) {
  return name.toLowerCase().replaceAll(/[-_.]+/gu, '-');
}

function toml() {
  return createRequire(import.meta.url)('smol-toml');
}

/** The distribution a requirement line names (`Django>=4 ; python_version>"3.8"` is Django). */
export function requirementName(line) {
  const text = line.replace(/\s+#.*$/u, '').trim();
  if (text === '' || text.startsWith('#')) return undefined;
  if (text.startsWith('-')) return undefined;
  if (/^[a-z+]+:\/\//iu.test(text)) return EGG_NAME.exec(text)?.[1];
  return REQUIREMENT_NAME.exec(text)?.[1];
}

function entry(name, group, file) {
  return { name, normalized: normalizeRequirementName(name), group, file };
}

function requirementEntries(list, group, file) {
  return (Array.isArray(list) ? list : [])
    .map((line) => requirementName(String(line)))
    .filter((name) => name !== undefined)
    .map((name) => entry(name, group, file));
}

/** Whether a group, extra or requirements-file suffix names development tooling (dev, test, lint, docs...). */
export function isDevelopmentGroup(name) {
  return DEV_NAME.test(String(name).toLowerCase());
}

function groupOf(name, fallback) {
  return isDevelopmentGroup(name) ? 'dev' : fallback;
}

function tableEntries(table, group, file) {
  return Object.keys(table ?? {})
    .filter((name) => name.toLowerCase() !== PYTHON_ENTRY)
    .map((name) => {
      const optional = typeof table[name] === 'object' && table[name]?.optional === true;
      return entry(name, optional && group === 'production' ? 'optional' : group, file);
    });
}

function poetryEntries(poetry = {}, file) {
  return [
    ...tableEntries(poetry.dependencies, 'production', file),
    ...tableEntries(poetry['dev-dependencies'], 'dev', file),
    ...Object.values(poetry.group ?? {}).flatMap((group) =>
      tableEntries(group?.dependencies, 'dev', file),
    ),
  ];
}

function pyprojectEntries(parsed, file) {
  const project = parsed.project ?? {};
  const tool = parsed.tool ?? {};
  return [
    ...requirementEntries(project.dependencies, 'production', file),
    ...Object.entries(project['optional-dependencies'] ?? {}).flatMap(([extra, list]) =>
      requirementEntries(list, groupOf(extra, 'optional'), file),
    ),
    ...Object.values(parsed['dependency-groups'] ?? {}).flatMap((list) =>
      requirementEntries(list, 'dev', file),
    ),
    ...requirementEntries(tool.uv?.['dev-dependencies'], 'dev', file),
    ...Object.values(tool.pdm?.['dev-dependencies'] ?? {}).flatMap((list) =>
      requirementEntries(list, 'dev', file),
    ),
    ...Object.values(tool.hatch?.envs ?? {}).flatMap((environment) =>
      requirementEntries(environment?.dependencies, 'dev', file),
    ),
    ...poetryEntries(tool.poetry, file),
  ];
}

function isDynamic(parsed) {
  const dynamic = parsed.project?.dynamic;
  return Array.isArray(dynamic) && dynamic.includes('dependencies');
}

function readPyproject(projectRoot) {
  const file = path.join(projectRoot, PYPROJECT);
  if (!existsSync(file)) return undefined;
  const parsed = toml().parse(readFileSync(file, 'utf8'));
  const declares =
    Array.isArray(parsed.project?.dependencies) || parsed.tool?.poetry?.dependencies !== undefined;
  return { entries: pyprojectEntries(parsed, PYPROJECT), declares, dynamic: isDynamic(parsed) };
}

function readPipfile(projectRoot) {
  const file = path.join(projectRoot, PIPFILE);
  if (!existsSync(file)) return undefined;
  const parsed = toml().parse(readFileSync(file, 'utf8'));
  const categories = Object.entries(parsed).filter(
    ([name, table]) => name.endsWith('packages') && typeof table === 'object',
  );
  return {
    entries: categories.flatMap(([name, table]) =>
      tableEntries(table, name === 'packages' ? 'production' : 'dev', PIPFILE),
    ),
    declares: parsed.packages !== undefined,
  };
}

function lines(value) {
  return String(value ?? '')
    .split(/\r?\n|;/u)
    .map((line) => line.trim());
}

function readSetupCfg(projectRoot) {
  const file = path.join(projectRoot, SETUP_CFG);
  if (!existsSync(file)) return undefined;
  const sections = parseIni(readFileSync(file, 'utf8'));
  const options = sections.get('options') ?? new Map();
  const extras = sections.get('options.extras_require') ?? new Map();
  return {
    entries: [
      ...requirementEntries(lines(options.get('install_requires')), 'production', SETUP_CFG),
      ...requirementEntries(lines(options.get('tests_require')), 'dev', SETUP_CFG),
      ...[...extras].flatMap(([extra, value]) =>
        requirementEntries(lines(value), groupOf(extra, 'optional'), SETUP_CFG),
      ),
    ],
    declares: options.has('install_requires'),
  };
}

function isDirectory(directory) {
  return existsSync(directory) && statSync(directory).isDirectory();
}

export function requirementFiles(projectRoot) {
  const directory = path.join(projectRoot, REQUIREMENT_DIRECTORY);
  return [
    ...readdirSync(projectRoot).filter((name) => REQUIREMENT_FILE.test(name)),
    ...(isDirectory(directory)
      ? readdirSync(directory)
          .filter((name) => /\.(?:txt|in)$/u.test(name))
          .map((name) => `${REQUIREMENT_DIRECTORY}/${name}`)
      : []),
  ].sort();
}

function requirementGroup(file) {
  const base = path.posix
    .basename(file)
    .replace(/\.(?:txt|in)$/u, '')
    .replace(/^requirements/u, '');
  return groupOf(base, 'production');
}

function readRequirements(projectRoot) {
  return requirementFiles(projectRoot).flatMap((file) =>
    requirementEntries(
      readFileSync(path.join(projectRoot, file), 'utf8').split(/\r?\n/u),
      requirementGroup(file),
      file,
    ),
  );
}

function uniqueNames(entries) {
  return [...new Set(entries.map(({ normalized }) => normalized))].sort();
}

function manifestOf(sources, dependencies) {
  const declaring = sources.find((source) => source?.declares === true);
  return (
    declaring?.file ?? dependencies.find(({ group }) => group === 'production')?.file ?? PYPROJECT
  );
}

/**
 * `runtime` and `development` are the normalized names (optional extras count as runtime);
 * `dependencies` lists each declaration `{ name, normalized, group: 'production' | 'dev' |
 * 'optional', file }`; `complete` says the production list is fully declared (not dynamic or in
 * setup.py); `manifest` is the file new production dependencies go in.
 */
export function readPythonDependencies(projectRoot) {
  const pyproject = readPyproject(projectRoot);
  const pipfile = readPipfile(projectRoot);
  const setupCfg = readSetupCfg(projectRoot);
  const requirements = readRequirements(projectRoot);
  const dependencies = [
    ...(pyproject?.entries ?? []),
    ...(pipfile?.entries ?? []),
    ...(setupCfg?.entries ?? []),
    ...requirements,
  ];
  const declaresProduction =
    [pyproject, pipfile, setupCfg].some((source) => source?.declares === true) ||
    requirements.some(({ group }) => group === 'production');
  const opaque =
    (pyproject?.dynamic === true && requirements.length === 0) ||
    (existsSync(path.join(projectRoot, 'setup.py')) && !declaresProduction);
  const development = dependencies.filter(({ group }) => group === 'dev');
  return {
    runtime: uniqueNames(dependencies.filter(({ group }) => group !== 'dev')),
    development: uniqueNames(development),
    dependencies,
    complete: declaresProduction && !opaque,
    declaresDev: development.length > 0,
    manifest: manifestOf(
      [
        pyproject && { ...pyproject, file: PYPROJECT },
        pipfile && { ...pipfile, file: PIPFILE },
        setupCfg && { ...setupCfg, file: SETUP_CFG },
      ],
      dependencies,
    ),
  };
}
