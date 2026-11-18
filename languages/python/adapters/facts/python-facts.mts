import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  listProductionModules,
  pythonSourceFiles,
  testFileMatcher,
} from '../analysis/python-sources.mts';
import { readPackageFacts } from '../../rules/libraries/package-facts.mts';
import { ROOT_TEST_DIRECTORIES } from '../execution/python-project.mts';
import { readPythonDependencies } from '../../libraries/python-dependencies.mts';
import { factsBundle } from './facts-bundle.mts';
import { withEntryPoints } from '../entry-points/python-entry-points.mts';
import { sharedFactFindings } from '../../../../shared/rules/facts/evaluate.mjs';
import { DESIGN_RULES } from '../../../../shared/project-rules/design/design-rules.mjs';
import { registeredFactRules } from '../../../../shared/project-rules/fact-rules.mjs';
import { FEATURE_RULES } from '../imports/python-feature-facts.mts';
import { RULE_IDS } from '../../../../shared/policy.mjs';
import { isFinding } from '../typed/report/finding-guards.mts';
import { isPlainObject, listOf, parseJson } from '../../../../shared/values/readers.mts';
import type { IngestedFinding } from '../../ingest/typed/ingest-types.mts';
import type { ScanContext, StdoutRun } from '../analysis/typed/coupling-types.mts';
import type { PythonModule } from '../analysis/typed/python-graph-types.mts';
import type { ToolContext } from '../typed/context/tool-context-types.mts';
import {
  scannedOf,
  type FactFindingOptions,
  type FactsBundle,
  type FactsReport,
  type ImportRecord,
  type Scanned,
} from './typed/facts-types.mts';

const PYTHON = 'python';
export const FACTS_REPORT = 'facts.json';
export const BASE_FACTS_REPORT = 'base-facts.json';
export const FACTS_TOOL = 'facts';
const FACTS_FAILED_RULE = 'facts-failed';
const FACTS_REQUEST = 'facts-request.json';
const MIGRATIONS_FOLDER = 'migrations';
const SCAN_SCRIPT = path.join(fileURLToPath(new URL('../', import.meta.url)), 'import-scan.py');
const DJANGO_ENTRY = 'manage.py';
const DJANGO_SETTING = 'INSTALLED_APPS';
const DJANGO_DISTRIBUTION = 'django';
const DISTRIBUTION_FILES = new Set(['pyproject.toml', 'setup.cfg', 'setup.py']);

function isDjangoApplication(
  root: string,
  scanned: Scanned,
  isTest: (file: string) => boolean,
): boolean {
  return (
    existsSync(path.join(root, DJANGO_ENTRY)) ||
    Object.entries(scanned).some(
      ([file, facts]) =>
        !isTest(file) && facts.definitions.some(({ name }) => name === DJANGO_SETTING),
    ) ||
    readPythonDependencies(root).dependencies.some(
      ({ normalized, group }) => normalized === DJANGO_DISTRIBUTION && group === 'production',
    )
  );
}

function ancestorFolders(file: string): string[] {
  const folders = file.split('/').slice(0, -1);
  return folders.map((_, index) => folders.slice(0, folders.length - index).join('/'));
}

function distributionLookup(root: string): (file: string) => string {
  const known = new Map<string, boolean>();
  function isDistribution(folder: string): boolean {
    const cached = known.get(folder);
    if (cached !== undefined) {
      return cached;
    }
    const full = path.resolve(root, folder);
    if (!full.startsWith(root + path.sep)) {
      return false;
    }
    const found = readdirSync(full).some((entry) => DISTRIBUTION_FILES.has(entry));
    known.set(folder, found);
    return found;
  }
  return (file) => ancestorFolders(file).find(isDistribution) ?? '';
}

function isMigration(file: string): boolean {
  return `/${file}`.includes(`/${MIGRATIONS_FOLDER}/`);
}

function factsFiles(
  projectRoot: string,
  sourceRoots: readonly string[],
  isTest: (file: string) => boolean,
): { modules: PythonModule[]; referenceFiles: string[]; files: string[] } {
  const modules = listProductionModules(projectRoot, sourceRoots);
  const roots = [...sourceRoots, ...ROOT_TEST_DIRECTORIES, '.'];
  const scanned = pythonSourceFiles(projectRoot, roots);
  const tests = scanned.filter(isTest);
  const referenceFiles = scanned.filter((file) => isMigration(file) && !isTest(file));
  return {
    modules,
    referenceFiles,
    files: [...new Set([...modules.map(({ file }) => file), ...tests, ...referenceFiles])].sort(),
  };
}

function scanFacts<Context extends ScanContext>(
  context: Context,
  run: StdoutRun<Context>,
  root: string,
): FactsBundle {
  const isTest = testFileMatcher(root);
  const { modules, files, referenceFiles } = factsFiles(root, context.project.sourceRoots, isTest);
  const request = path.join(context.reportRoot, FACTS_REQUEST);
  writeFileSync(request, JSON.stringify({ root, files, facts: true }));
  const scanned =
    files.length === 0
      ? {}
      : scannedOf(
          parseJson(
            run(context, ['python', '-I', SCAN_SCRIPT, request], { rule: FACTS_FAILED_RULE })
              .stdout,
          ),
        );
  const bundle = factsBundle({
    modules,
    scanned,
    isTest,
    referenceFiles,
    django: isDjangoApplication(root, scanned, isTest),
    packageOf: distributionLookup(root),
    ...readPackageFacts(root),
  });
  return withEntryPoints(bundle, scanned);
}

export function collectFacts<
  Context extends ScanContext & Pick<ToolContext, 'snapshot' | 'baselineRoot'>,
>(context: Context, run: StdoutRun<Context>): FactsBundle {
  const { projectRoot, reportRoot, snapshot, baselineRoot } = context;
  const report = scanFacts(context, run, projectRoot);
  writeFileSync(path.join(reportRoot, FACTS_REPORT), JSON.stringify(report));
  if (snapshot === 'head' && typeof baselineRoot === 'string') {
    const base = scanFacts(context, run, baselineRoot);
    writeFileSync(path.join(reportRoot, BASE_FACTS_REPORT), JSON.stringify(base));
  }
  return report;
}

function readReport(file: string): FactsReport | undefined {
  const report: unknown = existsSync(file) ? parseJson(readFileSync(file, 'utf8')) : undefined;
  return isPlainObject(report) ? report : undefined;
}

export function readFactImports(reportRoot: string): ImportRecord[] | undefined {
  const facts = readReport(path.join(reportRoot, FACTS_REPORT));
  if (facts === undefined) {
    return undefined;
  }
  const production = new Set(
    (facts.modules ?? []).filter(({ role }) => role === 'production').map(({ file }) => file),
  );
  return (facts.imports ?? []).filter(({ from, to }) => production.has(from) && production.has(to));
}

export function readFactFindings(
  reportRoot: string,
  { exceptions = [], baselineMovesFile, layout }: FactFindingOptions = {},
): IngestedFinding[] {
  const facts = readReport(path.join(reportRoot, FACTS_REPORT));
  if (facts === undefined) {
    return [];
  }
  const baseFacts = readReport(path.join(reportRoot, BASE_FACTS_REPORT));
  const rules = registeredFactRules(PYTHON).filter(
    (rule) =>
      rule !== RULE_IDS.testConsoleOutput &&
      !FEATURE_RULES.includes(rule) &&
      !DESIGN_RULES.includes(rule),
  );
  return listOf(
    sharedFactFindings(facts, {
      language: PYTHON,
      analyzerName: FACTS_TOOL,
      rules,
      policy: { exceptions, ...(layout === undefined ? {} : { layout }) },
      duplicatesAcrossPackages: true,
      ...(baseFacts === undefined
        ? {}
        : { baseline: { facts: baseFacts, movesFile: baselineMovesFile } }),
    }),
  ).filter(isFinding);
}
