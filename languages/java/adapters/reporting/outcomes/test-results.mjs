import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ingestCrap } from '../../../ingest/crap.mjs';
import { ingestJacoco } from '../../../ingest/coverage-reports/jacoco.mjs';
import { ingestJacocoBranches } from '../../../ingest/coverage-reports/jacoco-branches.mjs';
import { ingestPit } from '../../../ingest/pit.mjs';
import { javaMethodText } from '../../metrics/java-structure.mjs';
import { readSlowTestFindings } from '../../test-times/slow-tests.mjs';
import {
  hash,
  TESTS_FAILED_RULE,
  TESTS_FAILED_SKIPPED_RULE,
} from '../../../../../shared/rules/finding-helpers.mjs';
import {
  jacocoSourceRoots,
  reportOnlyKotlinMutants,
  sourceFileOf,
  sourceLocator,
} from '../kotlin-reports.mjs';
import {
  declarationUnits,
  functionLocator,
  sourceTextReader,
  structureFunctions,
} from '../function-locator.mjs';

export const TEST_FAILURES_REPORT = 'test-failures.json';
const TESTS_TOOL = 'tests';
const JACOCO = 'jacoco';
const TOOL_NAMES = new Map([
  [JACOCO, 'Coverage (JaCoCo)'],
  ['crap', 'CRAP'],
  ['pit', 'Mutation testing (PIT)'],
  ['test-runtime', 'Slow-test timing'],
]);
const NO_FAILURES = { failures: [], excludedTestClasses: [], skipped: [] };

function strings(value) {
  return Array.isArray(value) ? value.map(String) : [];
}

export function readTestFailures(reportRoot) {
  const file = path.join(reportRoot, TEST_FAILURES_REPORT);
  if (!existsSync(file)) {
    return NO_FAILURES;
  }
  const report = JSON.parse(readFileSync(file, 'utf8'));
  return {
    failures: strings(report?.failures),
    excludedTestClasses: strings(report?.excludedTestClasses),
    skipped: (Array.isArray(report?.skipped) ? report.skipped : []).filter(
      (entry) => TOOL_NAMES.has(entry?.tool) && typeof entry.reason === 'string',
    ),
  };
}

function toolError(tool, rule, message) {
  return { tool, rule, path: '.', identity: rule, message, classification: 'tool-error' };
}

export function snapshotScope({ snapshot = 'head', moduleLabel = '' }) {
  const side = `the ${snapshot} snapshot`;
  return moduleLabel === '' ? side : `module ${moduleLabel} of ${side}`;
}

function mutationLine({ excludedTestClasses, skipped }) {
  if (skipped.some(({ tool }) => tool === 'pit')) {
    return [];
  }
  return excludedTestClasses.length === 0
    ? []
    : [`Mutation testing (PIT) left out the test classes ${excludedTestClasses.join(', ')}.`];
}

export function testFailureFindings(report, scope) {
  if (report.failures.length === 0) {
    return [];
  }
  const where = snapshotScope(scope);
  const skippedLines = report.skipped.map(
    ({ tool, reason }) => `${TOOL_NAMES.get(tool)} did not run: ${reason}.`,
  );
  return [
    toolError(
      TESTS_TOOL,
      TESTS_FAILED_RULE,
      [
        `Tests fail in ${where}. Make each failing test pass:`,
        ...report.failures.map((failure) => `  ${failure}`),
        'The static analyzers ran as usual; coverage and CRAP come from the tests that ran.',
        ...mutationLine(report),
        ...skippedLines,
      ].join('\n'),
    ),
    ...report.skipped.map(({ tool, reason }) =>
      toolError(
        tool,
        TESTS_FAILED_SKIPPED_RULE,
        `${TOOL_NAMES.get(tool)} did not run in ${where}: ${reason}.`,
      ),
    ),
  ];
}

function containedFile(projectRoot, file) {
  const base = path.resolve(projectRoot);
  const full = path.resolve(base, file);
  if (!full.startsWith(base + path.sep)) {
    return undefined;
  }
  return full;
}

function isProjectFile(projectRoot, file) {
  const full = containedFile(projectRoot, file);
  return full !== undefined && existsSync(full);
}

function jacocoFindings(context) {
  const { projectRoot, jacoco } = context;
  return jacocoSourceRoots(context).flatMap((sourceRoot) =>
    ingestJacoco(jacoco, { sourceRoot }).findings.filter((finding) =>
      isProjectFile(projectRoot, finding.path),
    ),
  );
}

function crapFindings({ reportRoot, sourceRoots, projectRoot, reactorRoot, jacoco }, crapLimit) {
  const sources = new Map();
  const structure = JSON.parse(readFileSync(path.join(reportRoot, 'structure.json'), 'utf8'));
  return ingestCrap(structure, jacoco, {
    sourceRoots,
    limit: crapLimit,
    sourceHash: (entry) =>
      isProjectFile(projectRoot, entry.file)
        ? hash(javaMethodText(sources, { projectRoot, reactorRoot }, entry))
        : undefined,
  }).findings;
}

function pitFindings(context) {
  const { reportRoot, projectRoot } = context;
  const pitReport = path.join(reportRoot, 'pit/mutations.xml');
  if (!existsSync(pitReport)) {
    return [];
  }
  const locate = sourceLocator(projectRoot, jacocoSourceRoots(context));
  const { findings } = ingestPit(readFileSync(pitReport, 'utf8'), {
    resolvePath: (className, sourceFile) => sourceFileOf(locate, className, sourceFile),
    functionAt: functionLocator(context),
  });
  return context.kotlin ? reportOnlyKotlinMutants(findings) : findings;
}

function branchFindings(context) {
  const { projectRoot } = context;
  return ingestJacocoBranches(context.jacoco, {
    functions: structureFunctions(context),
    units: declarationUnits,
    locate: sourceLocator(projectRoot, jacocoSourceRoots(context)),
    sourceText: sourceTextReader(projectRoot),
  }).findings;
}

export function testResultFindings(context, crapLimit) {
  const report = context.testReport;
  const skipped = new Set(report.skipped.map(({ tool }) => tool));
  const readers = [
    [JACOCO, () => jacocoFindings(context)],
    ['crap', () => crapFindings(context, crapLimit)],
    ['pit', () => pitFindings(context)],
    [JACOCO, () => branchFindings(context)],
    [
      'test-runtime',
      () =>
        readSlowTestFindings({
          reportRoot: context.reportRoot,
          projectRoot: context.projectRoot,
          testRoots: [
            ...(context.manifest.testSourceRoots ?? []),
            ...(context.manifest.kotlinTestSourceRoots ?? []),
          ],
          ...context.testTimes,
        }),
    ],
  ];
  return [
    ...testFailureFindings(report, context.testScope),
    ...readers.filter(([tool]) => !skipped.has(tool)).flatMap(([, read]) => read()),
  ];
}
