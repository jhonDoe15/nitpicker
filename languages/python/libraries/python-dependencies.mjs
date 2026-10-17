import { parseIni } from '../adapters/configuration/ini-parser.mjs';
import {
  dependencyEntry,
  groupOf,
  isDevelopmentGroup,
  normalizeRequirementName,
  requirementEntries,
  requirementName,
} from './dependencies/requirement-names.mjs';
import { requirementFiles } from './dependencies/requirement-files.mjs';
import { readSetupPy } from './dependencies/setup-py.mjs';
import { readProjectFile, toml } from './project-files.mjs';

const PYPROJECT = 'pyproject.toml';
const PIPFILE = 'Pipfile';
const SETUP_CFG = 'setup.cfg';
const SETUP_PY = 'setup.py';
const PYTHON_ENTRY = 'python';

export { isDevelopmentGroup, normalizeRequirementName, requirementName };

function tableEntries(table, group, file) {
  return Object.keys(table ?? {})
    .filter((name) => name.toLowerCase() !== PYTHON_ENTRY)
    .map((name) => {
      const optional = typeof table[name] === 'object' && table[name]?.optional === true;
      return dependencyEntry(name, optional && group === 'production' ? 'optional' : group, file);
    });
}

function poetryEntries(poetry = {}, file) {
  return [
    ...tableEntries(poetry.dependencies, 'production', file),
    ...tableEntries(poetry['dev-dependencies'], 'dev', file),
    ...Object.entries(poetry.group ?? {}).flatMap(([name, group]) =>
      tableEntries(group?.dependencies, name === 'main' ? 'production' : 'dev', file),
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
  const text = readProjectFile(projectRoot, PYPROJECT);
  if (text === undefined) {
    return undefined;
  }
  const parsed = toml().parse(text);
  const declares =
    Array.isArray(parsed.project?.dependencies) || parsed.tool?.poetry?.dependencies !== undefined;
  return { entries: pyprojectEntries(parsed, PYPROJECT), declares, dynamic: isDynamic(parsed) };
}

function readPipfile(projectRoot) {
  const text = readProjectFile(projectRoot, PIPFILE);
  if (text === undefined) {
    return undefined;
  }
  const parsed = toml().parse(text);
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
  const text = readProjectFile(projectRoot, SETUP_CFG);
  if (text === undefined) {
    return undefined;
  }
  const sections = parseIni(text);
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

function readRequirements(projectRoot) {
  return requirementFiles(projectRoot).flatMap(({ file, group, lines }) =>
    requirementEntries(lines, group, file),
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
 * 'optional', file }`; `complete` says the production list is fully declared (not dynamic or
 * computed in setup.py); `manifest` is the file new production dependencies go in.
 */
export function readPythonDependencies(projectRoot) {
  const pyproject = readPyproject(projectRoot);
  const pipfile = readPipfile(projectRoot);
  const setupCfg = readSetupCfg(projectRoot);
  const setupPy = readSetupPy(projectRoot);
  const requirements = readRequirements(projectRoot);
  const dependencies = [
    ...(pyproject?.entries ?? []),
    ...(pipfile?.entries ?? []),
    ...(setupCfg?.entries ?? []),
    ...(setupPy?.entries ?? []),
    ...requirements,
  ];
  const declaresProduction =
    [pyproject, pipfile, setupCfg, setupPy].some((source) => source?.declares === true) ||
    requirements.some(({ group }) => group === 'production');
  const opaque =
    (pyproject?.dynamic === true && requirements.length === 0) ||
    (setupPy !== undefined && !declaresProduction);
  const development = dependencies.filter(({ group }) => group === 'dev');
  const runtime = uniqueNames(dependencies.filter(({ group }) => group !== 'dev'));
  return {
    runtime,
    development: uniqueNames(development).filter((name) => !runtime.includes(name)),
    dependencies,
    complete: declaresProduction && !opaque,
    declaresDev: development.length > 0,
    manifest: manifestOf(
      [
        pyproject && { ...pyproject, file: PYPROJECT },
        pipfile && { ...pipfile, file: PIPFILE },
        setupCfg && { ...setupCfg, file: SETUP_CFG },
        setupPy && { ...setupPy, file: SETUP_PY },
      ],
      dependencies,
    ),
  };
}
