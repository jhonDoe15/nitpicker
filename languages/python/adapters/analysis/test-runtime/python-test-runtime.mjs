import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  classifyTestRuntime,
  testRuntimeReport,
} from '../../../../../shared/rules/test-runtime/classify.mjs';
import { hash } from '../../../../../shared/rules/finding-helpers.mjs';
import { evaluateTestRuntime } from '../../../../../shared/rules/test-runtime/evaluate.mjs';
import {
  isCollectedTestFile,
  matchesGlob,
  testFileOptions,
} from '../../configuration/pytest/collection-options.mjs';
import { readProjectFile } from '../../../libraries/project-files.mjs';
import { readImportsReport } from '../python-coupling.mjs';
import { buildRuntimeGraph } from './runtime-graph.mjs';

const TEST_RUNTIME_TOOL = 'test-runtime';
const STRINGS_REPORT = 'string-literals.json';
const SCAN_REQUEST = 'string-scan-request.json';
const SCAN_SCRIPT = path.join(fileURLToPath(new URL('./', import.meta.url)), 'string-scan.py');
const SCAN_FAILED_RULE = 'test-runtime-failed';
const CONFTEST = 'conftest.py';
const END_TO_END_FOLDERS = new Set(['e2e', 'end_to_end', 'contract']);
const UNITTEST_RUNNERS = new Set(['unittest', 'django']);
const UNITTEST_PATTERN = 'test*.py';
const FRAMEWORK_BRIDGES = ['django.test', 'rest_framework.test'];
const FRAMEWORK_CATEGORY = 'framework-production-runtime';

export function scanTestStrings(context, run) {
  const { projectRoot, reportRoot } = context;
  const { others = [] } = readImportsReport(reportRoot);
  let literals = {};
  if (others.length > 0) {
    const request = path.join(reportRoot, SCAN_REQUEST);
    writeFileSync(
      request,
      JSON.stringify({ root: projectRoot, files: others.map(({ file }) => file) }),
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
    (isCollectedTestFile(file, options) ||
      (UNITTEST_RUNNERS.has(runner) && matchesGlob(name, UNITTEST_PATTERN)))
  );
}

function isEndToEnd(file) {
  return path.posix
    .dirname(file)
    .split('/')
    .some((folder) => END_TO_END_FOLDERS.has(folder));
}

function importedNames({ level, module, names }) {
  if (level !== 0) {
    return [];
  }
  return module === null ? names : [module, ...names.map((name) => `${module}.${name}`)];
}

function importsFramework(statements, bridge) {
  return statements.some(
    (statement) =>
      statement.typeOnly !== true &&
      importedNames(statement).some((name) => name === bridge || name.startsWith(`${bridge}.`)),
  );
}

function frameworkBridges(files, imports) {
  return FRAMEWORK_BRIDGES.filter((bridge) =>
    files.some((file) => importsFramework(imports[file] ?? [], bridge)),
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
  const edges = buildRuntimeGraph({
    modules,
    others,
    imports,
    literals,
    loadsConftest: runner === 'pytest',
  });
  const production = new Set(modules.map(({ file }) => file));
  const excluded = candidates.filter((file) => isEndToEnd(file) || imports[file] === undefined);
  return testRuntimeReport({
    tests: candidates.filter((file) => !excluded.includes(file)),
    excluded,
    classify: (file) =>
      classifyTestRuntime(file, {
        edges,
        isProduction: (node) => production.has(node),
        bridgesOf: (test, visited) =>
          options.django ? frameworkBridges([test, ...visited], imports) : [],
        bridgeCategory: FRAMEWORK_CATEGORY,
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
    TEST_RUNTIME_TOOL,
  );
}
