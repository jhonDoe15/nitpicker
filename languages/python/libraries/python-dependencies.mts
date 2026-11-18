import { parseIni } from '../adapters/configuration/ini-parser.mts';
import {
  dependencyEntry,
  groupOf,
  isDevelopmentGroup,
  normalizeRequirementName,
  requirementEntries,
  requirementName,
} from './dependencies/requirement-names.mts';
import { requirementFiles } from './dependencies/requirement-files.mts';
import { readSetupPy } from './dependencies/setup-py.mts';
import { readProjectFile, toml } from './project-files.mts';
import type {
  DeclaredDependencies,
  DependencyEntry,
  DependencySource,
} from './typed/dependency-types.mts';
import { fieldOf, fieldsOf } from '../../../shared/values/readers.mts';

const PYPROJECT = 'pyproject.toml';
const PIPFILE = 'Pipfile';
const SETUP_CFG = 'setup.cfg';
const SETUP_PY = 'setup.py';
const PYTHON_ENTRY = 'python';
const PRODUCTION = 'production';
const OPTIONAL = 'optional';
const DEPENDENCIES = 'dependencies';
const DEV_DEPENDENCIES = 'dev-dependencies';
const PROJECT = 'project';
const PACKAGES = 'packages';

type SourceWithFile = DependencySource & { file: string };

export { isDevelopmentGroup, normalizeRequirementName, requirementName };

function tableEntries(table: unknown, group: string, file: string): DependencyEntry[] {
  return Object.keys(fieldsOf(table))
    .filter((name) => name.toLowerCase() !== PYTHON_ENTRY)
    .map((name) => {
      const optional = fieldOf(fieldOf(table, name), OPTIONAL) === true;
      return dependencyEntry(name, optional && group === PRODUCTION ? OPTIONAL : group, file);
    });
}

function poetryEntries(poetry: unknown, file: string): DependencyEntry[] {
  return [
    ...tableEntries(fieldOf(poetry, DEPENDENCIES), PRODUCTION, file),
    ...tableEntries(fieldOf(poetry, DEV_DEPENDENCIES), 'dev', file),
    ...Object.entries(fieldsOf(fieldOf(poetry, 'group'))).flatMap(([name, group]) =>
      tableEntries(fieldOf(group, DEPENDENCIES), name === 'main' ? PRODUCTION : 'dev', file),
    ),
  ];
}

function pyprojectEntries(parsed: unknown, file: string): DependencyEntry[] {
  const project = fieldOf(parsed, PROJECT);
  const tool = fieldOf(parsed, 'tool');
  return [
    ...requirementEntries(fieldOf(project, DEPENDENCIES), PRODUCTION, file),
    ...Object.entries(fieldsOf(fieldOf(project, 'optional-dependencies'))).flatMap(
      ([extra, list]) => requirementEntries(list, groupOf(extra, OPTIONAL), file),
    ),
    ...Object.values(fieldsOf(fieldOf(parsed, 'dependency-groups'))).flatMap((list) =>
      requirementEntries(list, 'dev', file),
    ),
    ...requirementEntries(fieldOf(fieldOf(tool, 'uv'), DEV_DEPENDENCIES), 'dev', file),
    ...Object.values(fieldsOf(fieldOf(fieldOf(tool, 'pdm'), DEV_DEPENDENCIES))).flatMap((list) =>
      requirementEntries(list, 'dev', file),
    ),
    ...Object.values(fieldsOf(fieldOf(fieldOf(tool, 'hatch'), 'envs'))).flatMap((environment) =>
      requirementEntries(fieldOf(environment, DEPENDENCIES), 'dev', file),
    ),
    ...poetryEntries(fieldOf(tool, 'poetry'), file),
  ];
}

function isDynamic(parsed: unknown): boolean {
  const dynamic = fieldOf(fieldOf(parsed, PROJECT), 'dynamic');
  return Array.isArray(dynamic) && dynamic.includes(DEPENDENCIES);
}

function readPyproject(projectRoot: string): (DependencySource & { dynamic: boolean }) | undefined {
  const text = readProjectFile(projectRoot, PYPROJECT);
  if (text === undefined) {
    return undefined;
  }
  const parsed = toml().parse(text);
  const declares =
    Array.isArray(fieldOf(fieldOf(parsed, PROJECT), DEPENDENCIES)) ||
    fieldOf(fieldOf(fieldOf(parsed, 'tool'), 'poetry'), DEPENDENCIES) !== undefined;
  return { entries: pyprojectEntries(parsed, PYPROJECT), declares, dynamic: isDynamic(parsed) };
}

function readPipfile(projectRoot: string): DependencySource | undefined {
  const text = readProjectFile(projectRoot, PIPFILE);
  if (text === undefined) {
    return undefined;
  }
  const parsed = toml().parse(text);
  const categories = Object.entries(fieldsOf(parsed)).filter(
    ([name, table]) => name.endsWith(PACKAGES) && typeof table === 'object',
  );
  return {
    entries: categories.flatMap(([name, table]) =>
      tableEntries(table, name === PACKAGES ? PRODUCTION : 'dev', PIPFILE),
    ),
    declares: fieldOf(parsed, PACKAGES) !== undefined,
  };
}

function lines(value: string | undefined): string[] {
  return (value ?? '').split(/\r?\n|;/u).map((line) => line.trim());
}

function readSetupCfg(projectRoot: string): DependencySource | undefined {
  const text = readProjectFile(projectRoot, SETUP_CFG);
  if (text === undefined) {
    return undefined;
  }
  const sections = parseIni(text);
  const options = sections.get('options') ?? new Map<string, string>();
  const extras = sections.get('options.extras_require') ?? new Map<string, string>();
  return {
    entries: [
      ...requirementEntries(lines(options.get('install_requires')), PRODUCTION, SETUP_CFG),
      ...requirementEntries(lines(options.get('tests_require')), 'dev', SETUP_CFG),
      ...[...extras].flatMap(([extra, value]) =>
        requirementEntries(lines(value), groupOf(extra, OPTIONAL), SETUP_CFG),
      ),
    ],
    declares: options.has('install_requires'),
  };
}

function readRequirements(projectRoot: string): DependencyEntry[] {
  return requirementFiles(projectRoot).flatMap(({ file, group, lines }) =>
    requirementEntries(lines, group, file),
  );
}

function uniqueNames(entries: readonly DependencyEntry[]): string[] {
  return [...new Set(entries.map(({ normalized }) => normalized))].sort();
}

function manifestOf(
  sources: (SourceWithFile | undefined)[],
  dependencies: readonly DependencyEntry[],
): string {
  const declaring = sources.find((source) => source?.declares === true);
  return (
    declaring?.file ?? dependencies.find(({ group }) => group === PRODUCTION)?.file ?? PYPROJECT
  );
}

export function readPythonDependencies(projectRoot: string): DeclaredDependencies {
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
    requirements.some(({ group }) => group === PRODUCTION);
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
