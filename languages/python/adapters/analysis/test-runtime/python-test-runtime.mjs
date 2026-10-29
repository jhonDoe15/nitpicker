import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FRAMEWORK_BRIDGE,
  classifyTestRuntime,
  testRuntimeReport,
} from '../../../../../shared/rules/test-runtime/classify.mjs';
import { hash } from '../../../../../shared/rules/finding-helpers.mjs';
import { evaluateTestRuntime } from '../../../../../shared/rules/test-runtime/evaluate.mjs';
import {
  TEST_RUNTIME_ANALYZER,
  isEndToEndPath,
} from '../../../../../shared/rules/test-runtime/scope.mjs';
import {
  isCollectedTestFile,
  matchesGlob,
  testFileOptions,
} from '../../configuration/pytest/collection-options.mjs';
import { readProjectFile } from '../../../libraries/project-files.mjs';
import { readImportsReport } from '../python-coupling.mjs';
import { CONFTEST, INIT } from './pytest/constants.mjs';
import { djangoBridges } from './pytest/django-bridge.mjs';
import { buildRuntimeGraph } from './runtime-graph.mjs';

const STRINGS_REPORT = 'string-literals.json';
const SCAN_REQUEST = 'string-scan-request.json';
const SCAN_SCRIPT = path.join(fileURLToPath(new URL('./', import.meta.url)), 'string-scan.py');
const SCAN_FAILED_RULE = 'test-runtime-failed';
const UNITTEST_RUNNERS = new Set(['unittest', 'django']);
const UNITTEST_PATTERN = 'test*.py';

export function scanTestStrings(context, run) {
  const { projectRoot, reportRoot } = context;
  const { modules = [], others = [] } = readImportsReport(reportRoot);
  let literals = {};
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
    literals = JSON.parse(result.stdout);
  }
  writeFileSync(path.join(reportRoot, STRINGS_REPORT), JSON.stringify(literals));
}

function readLiterals(reportRoot) {
  const report = path.join(reportRoot, STRINGS_REPORT);
  return existsSync(report) ? JSON.parse(readFileSync(report, 'utf8')) : {};
}

function isJudgedTest(file, { options, runner }) {
  const name = path.posix.basename(file);
  return (
    name !== CONFTEST &&
    name !== INIT &&
    (isCollectedTestFile(file, options) ||
      (UNITTEST_RUNNERS.has(runner) && matchesGlob(name, UNITTEST_PATTERN)))
  );
}

export function analyzePythonTestRuntime({
  modules,
  others = [],
  imports,
  literals = {},
  options,
  runner,
}) {
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
    literals,
    fixtureTests: runner === 'pytest' ? tests : [],
  });
  return testRuntimeReport({
    tests,
    excluded,
    classify: (file) =>
      classifyTestRuntime(file, {
        edges,
        isProduction: (node) => production.has(node),
        bridgesOf: (test, visited) =>
          options.django
            ? djangoBridges({ files: [test, ...visited], imports, fixtures: fixtures(test) })
            : [],
        bridgeCategory: FRAMEWORK_BRIDGE,
      }),
  });
}

function sourceHash(projectRoot, file) {
  return hash(readProjectFile(projectRoot, file) ?? file);
}

export function readTestRuntimeFindings({ reportRoot, projectRoot, runner }) {
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
