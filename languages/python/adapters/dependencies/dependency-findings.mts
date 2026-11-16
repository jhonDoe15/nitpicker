import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseJson } from '../../../../shared/values/readers.mts';
import { escapeRegExp } from '../../../../shared/paths/glob.mjs';
import { readProjectFile } from '../../libraries/project-files.mts';
import { readImportsReport } from '../analysis/python-coupling.mts';
import { snapshotScope } from '../test-runs/test-failures.mts';
import { impliedDistributions, topLevelImports } from './python-frameworks.mts';
import { probedTops, unresolvedImportFindings } from '../imports/unresolved-imports.mts';
import {
  normalizeRequirementName,
  readPythonDependencies,
} from '../../libraries/python-dependencies.mts';
import type { IngestedFinding } from '../../ingest/typed/ingest-types.mts';
import type { ImportsReport } from '../analysis/typed/python-graph-types.mts';
import type { StdoutRun } from '../analysis/typed/coupling-types.mts';
import {
  dependenciesReportOf,
  scanOf,
  type Context,
  type DeclaredDependencies,
  type DependencyEntry,
  type DistributionScan,
  type FileEntry,
  type FullState,
  type HintEntry,
  type ImportedTop,
  type State,
} from './typed/scan-types.mts';

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

export function scanDependencies<Active extends Context>(
  context: Active,
  run: StdoutRun<Active>,
): void {
  const { reportRoot, projectRoot } = context;
  const imports = readImportsReport(reportRoot);
  const request = path.join(reportRoot, SCAN_REQUEST);
  const files = [...imports.modules, ...(imports.others ?? [])].map(({ file }) => file);
  writeFileSync(request, JSON.stringify({ root: projectRoot, files, tops: probedTops(imports) }));
  const result = run(context, ['python', '-I', SCAN_SCRIPT, request], {
    rule: 'dependencies-failed',
  });
  writeFileSync(
    path.join(reportRoot, DEPENDENCIES_REPORT),
    JSON.stringify({
      declared: readPythonDependencies(projectRoot),
      scan: scanOf(parseJson(result.stdout)),
      environment: context.launcher.description,
    }),
  );
}

function toolSkipped(message: string): IngestedFinding {
  return {
    tool: DEPENDENCIES_TOOL,
    rule: 'tool-skipped',
    path: '.',
    identity: 'tool-skipped',
    message,
    classification: 'tool-error',
  };
}

function pythonTooOld(version: readonly number[]): boolean {
  const [major = 0, minor = 0] = version;
  const [minimumMajor = 0, minimumMinor = 0] = MINIMUM_PYTHON;
  return major < minimumMajor || (major === minimumMajor && minor < minimumMinor);
}

function installedModules(scan: DistributionScan): Map<string, string[]> {
  const byDistribution = new Map<string, string[]>();
  for (const [module, distributions] of Object.entries(scan.modules ?? {})) {
    for (const distribution of distributions) {
      const name = normalizeRequirementName(distribution);
      byDistribution.set(name, [...(byDistribution.get(name) ?? []), module]);
    }
  }
  return byDistribution;
}

function dependencyState(
  { declared, scan }: { declared: DeclaredDependencies; scan: DistributionScan },
  imports: ImportsReport,
): State {
  const project = [...imports.modules, ...(imports.others ?? [])];
  return {
    declared,
    scan,
    imports,
    projectModules: new Set(project.map(({ module }) => module.split('.')[0] ?? '')),
    stdlib: new Set([...(scan.stdlib ?? []), '__future__']),
    declaredBy: Map.groupBy(declared.dependencies, ({ normalized }) => normalized),
  };
}

function importedTops(state: State, entry: FileEntry): ImportedTop[] {
  return (state.imports.imports[entry.file] ?? []).flatMap((statement) =>
    topLevelImports(statement)
      .filter((top) => !(state.projectModules.has(top) || state.stdlib.has(top)))
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

function hint(entry: HintEntry, message: string): IngestedFinding {
  return { ...entry, tool: DEPENDENCIES_TOOL, classification: 'enforceable', message };
}

function unlistedFinding(
  state: State,
  entry: FileEntry,
  { top, distributions }: ImportedTop,
): IngestedFinding {
  const [distribution = ''] = distributions;
  return hint(
    { rule: DEPENDENCY_RULES.unlisted, path: entry.file, identity: `unlisted:${distribution}` },
    `Package ${distribution} is imported (as ${top}) but not listed in ${state.declared.manifest}. Add it to the project dependencies (a dev dependency group for tests and tooling)`,
  );
}

function devOnlyFinding(entry: FileEntry, declaring: DependencyEntry): IngestedFinding {
  const { normalized, file } = declaring;
  return hint(
    {
      rule: DEPENDENCY_RULES.devInProduction,
      path: entry.file,
      identity: `dev-only:${normalized}`,
    },
    `${normalized} is only a dev dependency, but production code imports it. Move it to the production dependencies in ${file}`,
  );
}

function importFindings(state: State, entry: FileEntry, production: boolean): IngestedFinding[] {
  const seen = new Set<string>();
  return importedTops(state, entry).flatMap((imported) => {
    if (imported.typeOnly || seen.has(imported.top)) {
      return [];
    }
    seen.add(imported.top);
    const declaring = imported.distributions.flatMap((name) => state.declaredBy.get(name) ?? []);
    const [first] = declaring;
    if (first === undefined) {
      const reported =
        imported.distributions.length === 1 && (production || state.declared.declaresDev);
      return reported ? [unlistedFinding(state, entry, imported)] : [];
    }
    return production && declaring.every(({ group }) => group === 'dev')
      ? [devOnlyFinding(entry, first)]
      : [];
  });
}

function usedDistributions(state: FullState): Set<string> {
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

function optionalOfDeclared(state: State): string[] {
  return Object.entries(state.scan.optional ?? {})
    .filter(([owner]) => state.declaredBy.has(normalizeRequirementName(owner)))
    .flatMap(([, optional]) => optional);
}

function lineOf(projectRoot: string, file: string, name: string): number | undefined {
  const text = readProjectFile(projectRoot, file);
  if (text === undefined) {
    return undefined;
  }
  const pattern = new RegExp(
    `(^|["'\\s])${name.split(/[-_.]/u).map(escapeRegExp).join('[-_.]')}(?![\\w-])`,
    'iu',
  );
  const index = text.split(/\r?\n/u).findIndex((line) => pattern.test(line));
  return index === -1 ? undefined : index + 1;
}

function unusedFindings(state: FullState, projectRoot: string): IngestedFinding[] {
  const used = usedDistributions(state);
  const installed = installedModules(state.scan);
  const references = new Set(state.scan.references ?? []);
  return state.declared.dependencies
    .filter(({ group, normalized }) => group === 'production' && installed.has(normalized))
    .filter(({ normalized }) => !(used.has(normalized) || LOADED_BY_NAME.has(normalized)))
    .filter(
      ({ normalized }) =>
        !(installed.get(normalized) ?? []).some((module) => references.has(module)),
    )
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

export function readDependencyFindings({
  reportRoot,
  projectRoot,
  snapshot,
}: {
  reportRoot: string;
  projectRoot: string;
  snapshot?: string | undefined;
}): IngestedFinding[] {
  const report = path.join(reportRoot, DEPENDENCIES_REPORT);
  if (!existsSync(report)) {
    return [];
  }
  const dependencies = dependenciesReportOf(readFileSync(report, 'utf8'));
  const { scan, declared } = dependencies;
  if (pythonTooOld(scan.python)) {
    return [
      toolSkipped(
        `The dependency checks did not run in ${snapshotScope(snapshot)}: they read the installed distributions with importlib.metadata.packages_distributions, which needs Python ${MINIMUM_PYTHON.join('.')} or newer, and the ${dependencies.environment} environment runs Python ${scan.python.join('.')}. The other analyzers still ran.`,
      ),
    ];
  }
  const imports = readImportsReport(reportRoot);
  const unresolved = unresolvedImportFindings({ projectRoot, imports, scan, declared });
  if (!declared.complete) {
    return unresolved;
  }
  const state: FullState = {
    ...dependencyState(dependencies, imports),
    implied: impliedDistributions(projectRoot, imports),
  };
  const tests = (state.imports.others ?? []).filter(({ kind }) => kind === 'test');
  return [
    ...state.imports.modules.flatMap((entry) => importFindings(state, entry, true)),
    ...tests.flatMap((entry) => importFindings(state, entry, false)),
    ...unusedFindings(state, projectRoot),
    ...unresolved,
  ];
}
