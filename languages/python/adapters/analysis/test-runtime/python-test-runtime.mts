import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FRAMEWORK_BRIDGE } from '../../../../../shared/rules/test-runtime/classify.mjs';
import { hash } from '../../../../../shared/rules/finding-helpers.mjs';
import {
  TEST_RUNTIME_ANALYZER,
  isEndToEndPath,
} from '../../../../../shared/rules/test-runtime/scope.mjs';
import {
  isCollectedTestFile,
  matchesGlob,
  testFileOptions,
} from '../../configuration/pytest/collection-options.mts';
import { readProjectFile } from '../../../libraries/project-files.mts';
import { readImportsReport } from '../python-coupling.mts';
import { CONFTEST, INIT } from './pytest/constants.mts';
import { djangoBridges } from './pytest/django-bridge.mts';
import { buildRuntimeGraph } from './runtime-graph.mts';
import { parseJson } from '../../../../../shared/values/readers.mts';
import type { IngestedFinding } from '../../../ingest/typed/ingest-types.mts';
import type { TestFileSettings } from '../../configuration/typed/config-types.mts';
import type { RootsContext, StdoutRun } from '../typed/coupling-types.mts';
import type { ImportsByFile, OtherModule, PythonModule } from '../typed/python-graph-types.mts';
import { literalsOf, type TestRuntimeReport } from './typed/runtime-types.mts';
import {
  classifyTestRuntime,
  evaluateTestRuntime,
  testRuntimeReport,
} from './typed/runtime-views.mts';

type RuntimeRequest = {
  modules: readonly PythonModule[];
  others?: readonly OtherModule[];
  imports: ImportsByFile;
  literals?: unknown;
  options: TestFileSettings;
  runner?: string | undefined;
};

const STRINGS_REPORT = 'string-literals.json';
const SCAN_REQUEST = 'string-scan-request.json';
const SCAN_SCRIPT = path.join(fileURLToPath(new URL('./', import.meta.url)), 'string-scan.py');
const SCAN_FAILED_RULE = 'test-runtime-failed';
const UNITTEST_RUNNERS = new Set(['unittest', 'django']);
const UNITTEST_PATTERN = 'test*.py';

export function scanTestStrings<Context extends RootsContext>(
  context: Context,
  run: StdoutRun<Context>,
): void {
  const { projectRoot, reportRoot } = context;
  const { modules, others = [] } = readImportsReport(reportRoot);
  let literals: unknown = {};
  if (others.length > 0) {
    const request = path.join(reportRoot, SCAN_REQUEST);
    writeFileSync(
      request,
      JSON.stringify({
        root: projectRoot,
        files: others.map(({ file }) => file),
        modules: Object.fromEntries(modules.map(({ module, file }) => [module, file])),
      }),
    );
    const result = run(context, ['python', '-I', SCAN_SCRIPT, request], {
      rule: SCAN_FAILED_RULE,
    });
    literals = parseJson(result.stdout);
  }
  writeFileSync(path.join(reportRoot, STRINGS_REPORT), JSON.stringify(literals));
}

function readLiterals(reportRoot: string): unknown {
  const report = path.join(reportRoot, STRINGS_REPORT);
  return existsSync(report) ? parseJson(readFileSync(report, 'utf8')) : {};
}

function isJudgedTest(
  file: string,
  { options, runner }: { options: TestFileSettings; runner: string | undefined },
): boolean {
  const name = path.posix.basename(file);
  return (
    name !== CONFTEST &&
    name !== INIT &&
    (isCollectedTestFile(file, options) ||
      (runner !== undefined && UNITTEST_RUNNERS.has(runner) && matchesGlob(name, UNITTEST_PATTERN)))
  );
}

export function analyzePythonTestRuntime({
  modules,
  others = [],
  imports,
  literals,
  options,
  runner,
}: RuntimeRequest): TestRuntimeReport {
  const fileLiterals = literalsOf(literals);
  const candidates = others
    .filter(({ kind, file }) => kind === 'test' && isJudgedTest(file, { options, runner }))
    .map(({ file }) => file)
    .sort();
  const production = new Set(modules.map(({ file }) => file));
  const excluded = candidates.filter((file) => isEndToEndPath(file) || imports[file] === undefined);
  const tests = candidates.filter((file) => !excluded.includes(file));
  const { edges, fixtures } = buildRuntimeGraph({
    modules,
    others,
    imports,
    literals: fileLiterals,
    fixtureTests: runner === 'pytest' ? tests : [],
  });
  return testRuntimeReport({
    tests,
    excluded,
    classify: (file) =>
      classifyTestRuntime(file, {
        edges,
        isProduction: (node) => production.has(node),
        bridgesOf: (test: string, visited: Set<string>) =>
          options.django
            ? djangoBridges({ files: [test, ...visited], imports, fixtures: fixtures(test) })
            : [],
        bridgeCategory: FRAMEWORK_BRIDGE,
      }),
  });
}

function sourceHash(projectRoot: string, file: string): string {
  return hash(readProjectFile(projectRoot, file) ?? file);
}

export function readTestRuntimeFindings({
  reportRoot,
  projectRoot,
  runner,
}: {
  reportRoot: string;
  projectRoot: string;
  runner?: string | undefined;
}): IngestedFinding[] {
  const imports = readImportsReport(reportRoot);
  const report = analyzePythonTestRuntime({
    ...imports,
    literals: readLiterals(reportRoot),
    options: testFileOptions(projectRoot),
    runner,
  });
  if (report.summary.discoveredTests === 0) {
    return [];
  }
  return evaluateTestRuntime(
    {
      ...report,
      findings: report.findings.map((finding) => ({
        ...finding,
        sourceHash: sourceHash(projectRoot, finding.test),
      })),
    },
    TEST_RUNTIME_ANALYZER,
  );
}
