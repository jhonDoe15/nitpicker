import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readProjectFile } from '../../libraries/project-files.mjs';
import { readImportsReport } from '../analysis/python-coupling.mjs';
import { snapshotScope } from '../test-runs/test-failures.mjs';
import { impliedDistributions } from './python-frameworks.mjs';
import {
  normalizeRequirementName,
  readPythonDependencies,
} from '../../libraries/python-dependencies.mjs';

const DEPENDENCIES_TOOL = 'dependencies';
const DEPENDENCY_RULES = {
  unused: 'unused-dependency',
  unlisted: 'unlisted-dependency',
  devInProduction: 'no-dev-dependency-in-production',
};
const DEPENDENCIES_REPORT = 'dependencies.json';
const SCAN_REQUEST = 'distribution-scan-request.json';
const SCAN_SCRIPT = path.join(fileURLToPath(new URL('.', import.meta.url)), 'distribution-scan.py');
const MINIMUM_PYTHON = [3, 10];
const LOADED_BY_NAME = new Set(
  [
    'psycopg2',
    'psycopg2-binary',
    'psycopg',
    'psycopg-binary',
    'mysqlclient',
    'pymysql',
    'asyncpg',
    'aiosqlite',
    'oracledb',
    'cx-oracle',
    'pyodbc',
    'tzdata',
    'setuptools',
    'wheel',
    'pip',
  ].map(normalizeRequirementName),
);

export function scanDependencies(context, run) {
  const { reportRoot, projectRoot } = context;
  const { modules, others = [] } = readImportsReport(reportRoot);
  const request = path.join(reportRoot, SCAN_REQUEST);
  const files = [...modules, ...others].map(({ file }) => file);
  writeFileSync(request, JSON.stringify({ root: projectRoot, files }));
  const result = run(context, ['python', '-I', SCAN_SCRIPT, request], {
    rule: 'dependencies-failed',
  });
  writeFileSync(
    path.join(reportRoot, DEPENDENCIES_REPORT),
    JSON.stringify({
      declared: readPythonDependencies(projectRoot),
      scan: JSON.parse(result.stdout),
      environment: context.launcher.description,
    }),
  );
}

function toolSkipped(message) {
  return {
    tool: DEPENDENCIES_TOOL,
    rule: 'tool-skipped',
    path: '.',
    identity: 'tool-skipped',
    message,
    classification: 'tool-error',
  };
}

function pythonTooOld(version) {
  return (
    version[0] < MINIMUM_PYTHON[0] ||
    (version[0] === MINIMUM_PYTHON[0] && version[1] < MINIMUM_PYTHON[1])
  );
}

function topLevelImports(statement) {
  if (statement.level !== 0) {
    return [];
  }
  const names = statement.module === null ? statement.names : [statement.module];
  return names.map((name) => name.split('.')[0]);
}

function installedModules(scan) {
  const byDistribution = new Map();
  for (const [module, distributions] of Object.entries(scan.modules ?? {})) {
    for (const distribution of distributions) {
      const name = normalizeRequirementName(distribution);
      byDistribution.set(name, [...(byDistribution.get(name) ?? []), module]);
    }
  }
  return byDistribution;
}

function dependencyState({ declared, scan }, imports) {
  const project = [...imports.modules, ...(imports.others ?? [])];
  return {
    declared,
    scan,
    imports,
    projectModules: new Set(project.map(({ module }) => module.split('.')[0])),
    stdlib: new Set([...(scan.stdlib ?? []), '__future__']),
    declaredBy: Map.groupBy(declared.dependencies, ({ normalized }) => normalized),
  };
}

function importedTops(state, entry) {
  return (state.imports.imports[entry.file] ?? []).flatMap((statement) =>
    topLevelImports(statement)
      .filter((top) => !state.projectModules.has(top) && !state.stdlib.has(top))
      .map((top) => ({
        top,
        distributions: (state.scan.modules?.[top] ?? []).map((name) =>
          normalizeRequirementName(name),
        ),
        typeOnly: statement.typeOnly === true,
      }))
      .filter(({ distributions }) => distributions.length > 0),
  );
}

function hint(entry, message) {
  return { ...entry, tool: DEPENDENCIES_TOOL, classification: 'enforceable', message };
}

function unlistedFinding(state, entry, { top, distributions }) {
  const [distribution] = distributions;
  return hint(
    { rule: DEPENDENCY_RULES.unlisted, path: entry.file, identity: `unlisted:${distribution}` },
    `Package ${distribution} is imported (as ${top}) but not listed in ${state.declared.manifest}. Add it to the project dependencies (a dev dependency group for tests and tooling)`,
  );
}

function devOnlyFinding(entry, declaring) {
  const [{ normalized, file }] = declaring;
  return hint(
    {
      rule: DEPENDENCY_RULES.devInProduction,
      path: entry.file,
      identity: `dev-only:${normalized}`,
    },
    `${normalized} is only a dev dependency, but production code imports it. Move it to the production dependencies in ${file}`,
  );
}

function importFindings(state, entry, production) {
  const seen = new Set();
  return importedTops(state, entry).flatMap((imported) => {
    if (imported.typeOnly || seen.has(imported.top)) {
      return [];
    }
    seen.add(imported.top);
    const declaring = imported.distributions.flatMap((name) => state.declaredBy.get(name) ?? []);
    if (declaring.length === 0) {
      const reported =
        imported.distributions.length === 1 && (production || state.declared.declaresDev);
      return reported ? [unlistedFinding(state, entry, imported)] : [];
    }
    return production && declaring.every(({ group }) => group === 'dev')
      ? [devOnlyFinding(entry, declaring)]
      : [];
  });
}

function usedDistributions(state) {
  const files = [...state.imports.modules, ...(state.imports.others ?? [])];
  const used = new Set(
    files.flatMap((entry) =>
      importedTops(state, entry).flatMap(({ distributions }) => distributions),
    ),
  );
  for (const name of state.scan.entryPoints ?? []) {
    used.add(normalizeRequirementName(name));
  }
  for (const name of optionalOfDeclared(state)) {
    used.add(normalizeRequirementName(name));
  }
  for (const name of state.implied) {
    used.add(normalizeRequirementName(name));
  }
  return used;
}

function optionalOfDeclared(state) {
  return Object.entries(state.scan.optional ?? {})
    .filter(([owner]) => state.declaredBy.has(normalizeRequirementName(owner)))
    .flatMap(([, optional]) => optional);
}

function lineOf(projectRoot, file, name) {
  const text = readProjectFile(projectRoot, file);
  if (text === undefined) {
    return undefined;
  }
  const pattern = new RegExp(`(^|["'\\s])${name.replaceAll(/[-_.]/gu, '[-_.]')}(?![\\w-])`, 'iu');
  const index = text.split(/\r?\n/u).findIndex((line) => pattern.test(line));
  return index === -1 ? undefined : index + 1;
}

function unusedFindings(state, projectRoot) {
  const used = usedDistributions(state);
  const installed = installedModules(state.scan);
  const references = new Set(state.scan.references ?? []);
  return state.declared.dependencies
    .filter(({ group, normalized }) => group === 'production' && installed.has(normalized))
    .filter(({ normalized }) => !used.has(normalized) && !LOADED_BY_NAME.has(normalized))
    .filter(({ normalized }) => !installed.get(normalized).some((module) => references.has(module)))
    .map(({ name, normalized, file }) => {
      const line = lineOf(projectRoot, file, name);
      return hint(
        {
          rule: DEPENDENCY_RULES.unused,
          path: file,
          identity: `unused:${normalized}`,
          ...(line === undefined ? {} : { location: { line } }),
        },
        `Unused dependency ${name}: nothing imports or runs it. Remove it from ${file}`,
      );
    });
}

export function readDependencyFindings({ reportRoot, projectRoot, snapshot }) {
  const report = path.join(reportRoot, DEPENDENCIES_REPORT);
  if (!existsSync(report)) {
    return [];
  }
  const dependencies = JSON.parse(readFileSync(report, 'utf8'));
  const { scan, declared } = dependencies;
  if (pythonTooOld(scan.python)) {
    return [
      toolSkipped(
        `The dependency checks did not run in ${snapshotScope(snapshot)}: they read the installed distributions with importlib.metadata.packages_distributions, which needs Python ${MINIMUM_PYTHON.join('.')} or newer, and the ${dependencies.environment} environment runs Python ${scan.python.join('.')}. The other analyzers still ran.`,
      ),
    ];
  }
  if (!declared.complete) {
    return [];
  }
  const imports = readImportsReport(reportRoot);
  const state = {
    ...dependencyState(dependencies, imports),
    implied: impliedDistributions(projectRoot, imports),
  };
  const tests = (state.imports.others ?? []).filter(({ kind }) => kind === 'test');
  return [
    ...state.imports.modules.flatMap((entry) => importFindings(state, entry, true)),
    ...tests.flatMap((entry) => importFindings(state, entry, false)),
    ...unusedFindings(state, projectRoot),
  ];
}
