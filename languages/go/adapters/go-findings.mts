import { UNUSED_API_RULE_IDS } from '../../../shared/unused-api/unused-api-policy.mjs';
import { goCouplingFindings } from './coupling/go-coupling.mts';
import { goDomainFindings } from './domain/go-domain.mts';
import { goFactFindings, readGoBaseline, readGoFacts } from './facts/go-fact-findings.mts';
import { GO_LINT_TOOLS } from './configuration/go-config.mjs';
import { goStructureFindings } from './structure/go-structure.mts';
import { goSlowTestFindings } from './tests/go-slow-tests.mts';
import { goCoverageFindings } from './branch-coverage/go-coverage.mts';
import { raceCheckFindings, withoutRaceOnlyFailures } from './race/race-findings.mts';
import { goTestRuntimeFindings } from './test-runtime/go-test-runtime.mts';
import { goEntryPointFindings } from './entry-points/go-entry-points.mts';
import { readInspect, readTestRun, readVetFindings, testRunFindings } from './typed/go-readers.mts';
import {
  formatFindings,
  lintFindings,
  readDeadcodeFindings,
  readFormatReport,
  readGoDuplicateFindings,
  readTidyFindings,
  sharedRouteRule,
} from './typed/go-run-readers.mts';
import type { FindingRow, GoContext, GoFacts, GoPolicy } from './go-types.mts';

const UNUSED_LINT_RULE = 'U1000';

export function goRouteRule(finding: FindingRow): string | undefined {
  return GO_LINT_TOOLS.includes(finding.tool)
    ? `${finding.tool}/${finding.rule}`
    : sharedRouteRule(finding);
}

const GOFUMPT_LAYOUT_RULES = new Set(['empty-lines', 'comment-spacings']);

function formatterFindings(
  context: GoContext,
  report: Readonly<Record<string, readonly string[]>>,
) {
  return Object.entries(report).flatMap(([formatter, files]) =>
    formatFindings(context, { formatter, files }),
  );
}

function withoutGofumptOverlap(
  findings: readonly FindingRow[],
  report: Readonly<Record<string, readonly string[]>>,
) {
  const gofumptFiles = new Set(report['gofumpt'] ?? []);
  return findings.filter(
    (finding) =>
      finding.tool !== 'revive' ||
      !GOFUMPT_LAYOUT_RULES.has(finding.rule) ||
      !gofumptFiles.has(finding.path),
  );
}

function deadCodeFindings(
  context: GoContext,
  { facts, policy, lint }: { facts: GoFacts; policy: GoPolicy; lint: readonly FindingRow[] },
) {
  const factFindings = goFactFindings(facts, { policy, baseline: readGoBaseline(context) });
  const testOnly = factFindings.filter(({ rule }) => rule === UNUSED_API_RULE_IDS.testOnlyExport);
  const unused = lint.filter(({ rule }) => rule === UNUSED_LINT_RULE);
  return [
    ...factFindings,
    ...readDeadcodeFindings(context, { facts, testOnly, unused }),
    ...readTidyFindings(context),
  ];
}

export function readGoFindings(context: GoContext, policy: GoPolicy = {}): FindingRow[] {
  const report = readInspect(context.reportRoot);
  const testRun = readTestRun(context.reportRoot);
  const formatReport = readFormatReport(context.reportRoot);
  const lint = withoutGofumptOverlap(lintFindings(context), formatReport);
  const facts = readGoFacts(context);
  return [
    ...formatterFindings(context, formatReport),
    ...readVetFindings(context),
    ...lint,
    ...testRunFindings(withoutRaceOnlyFailures(testRun, context.reportRoot), context.snapshot),
    ...raceCheckFindings(context, testRun),
    ...goSlowTestFindings(context, testRun, report),
    ...goStructureFindings(report, context.projectRoot, policy),
    ...goCoverageFindings(context, { report, testRun }, policy),
    ...readGoDuplicateFindings(context.reportRoot, context.projectRoot),
    ...goCouplingFindings(report, context.module),
    ...goDomainFindings(report, context.module),
    ...goTestRuntimeFindings(context, { facts, report }),
    ...goEntryPointFindings(report, {
      facts,
      module: context.module,
      exceptions: policy.exceptions,
    }),
    ...deadCodeFindings(context, { facts, policy, lint }),
  ];
}
