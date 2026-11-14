import { sharedRouteRule } from '../../../shared/exceptions/routes.mjs';
import { UNUSED_API_RULE_IDS } from '../../../shared/unused-api/unused-api-policy.mjs';
import { readVetFindings } from './build/go-vet.mjs';
import { goCouplingFindings } from './coupling/go-coupling.mjs';
import { readDeadcodeFindings } from './dead-code/go-deadcode.mjs';
import { goDomainFindings } from './domain/go-domain.mjs';
import { readTidyFindings } from './dead-code/go-mod-tidy.mjs';
import { readGoDuplicateFindings } from './duplicates/go-duplicates.mjs';
import { goFactFindings, readGoBaseline, readGoFacts } from './facts/go-fact-findings.mjs';
import { GO_LINT_TOOLS } from './configuration/go-config.mjs';
import { formatFindings } from './formatting/go-format.mjs';
import { lintFindings } from './lint/go-lint.mjs';
import { readFormatReport } from './go-steps.mjs';
import { goStructureFindings } from './structure/go-structure.mjs';
import { readInspect } from './structure/go-inspect.mjs';
import { goSlowTestFindings } from './tests/go-slow-tests.mjs';
import { goCoverageFindings } from './branch-coverage/go-coverage.mjs';
import { readTestRun, testRunFindings } from './tests/go-test.mjs';
import { raceCheckFindings, withoutRaceOnlyFailures } from './race/race-findings.mjs';

const UNUSED_LINT_RULE = 'U1000';

export function goRouteRule(finding) {
  return GO_LINT_TOOLS.includes(finding.tool)
    ? `${finding.tool}/${finding.rule}`
    : sharedRouteRule(finding);
}

const GOFUMPT_LAYOUT_RULES = new Set(['empty-lines', 'comment-spacings']);

function formatterFindings(context, report) {
  return Object.entries(report).flatMap(([formatter, files]) =>
    formatFindings(context, { formatter, files }),
  );
}

function withoutGofumptOverlap(findings, report) {
  const gofumptFiles = new Set(report.gofumpt ?? []);
  return findings.filter(
    (finding) =>
      finding.tool !== 'revive' ||
      !GOFUMPT_LAYOUT_RULES.has(finding.rule) ||
      !gofumptFiles.has(finding.path),
  );
}

function deadCodeFindings(context, { policy, lint }) {
  const facts = readGoFacts(context);
  const factFindings = goFactFindings(facts, { policy, baseline: readGoBaseline(context) });
  const testOnly = factFindings.filter(({ rule }) => rule === UNUSED_API_RULE_IDS.testOnlyExport);
  const unused = lint.filter(({ rule }) => rule === UNUSED_LINT_RULE);
  return [
    ...factFindings,
    ...readDeadcodeFindings(context, { facts, testOnly, unused }),
    ...readTidyFindings(context),
  ];
}

export function readGoFindings(context, policy = {}) {
  const report = readInspect(context.reportRoot);
  const testRun = readTestRun(context.reportRoot);
  const formatReport = readFormatReport(context.reportRoot);
  const lint = withoutGofumptOverlap(lintFindings(context), formatReport);
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
    ...deadCodeFindings(context, { policy, lint }),
  ];
}
