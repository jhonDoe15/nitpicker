import { sharedRouteRule } from '../../../shared/exceptions/routes.mjs';
import { UNUSED_API_RULE_IDS } from '../../../shared/unused-api/unused-api-policy.mjs';
import { readVetFindings } from './build/go-vet.mjs';
import { goCouplingFindings } from './coupling/go-coupling.mjs';
import { readDeadcodeFindings } from './dead-code/go-deadcode.mjs';
import { readTidyFindings } from './dead-code/go-mod-tidy.mjs';
import { readGoDuplicateFindings } from './duplicates/go-duplicates.mjs';
import { goFactFindings, readGoFacts } from './facts/go-fact-findings.mjs';
import { GO_LINT_TOOLS } from './configuration/go-config.mjs';
import { formatFindings } from './formatting/go-format.mjs';
import { readFormatReport } from './go-steps.mjs';
import { goStructureFindings } from './structure/go-structure.mjs';
import { readInspect } from './structure/go-inspect.mjs';
import { goSlowTestFindings } from './tests/go-slow-tests.mjs';
import { readTestRun, testRunFindings } from './tests/go-test.mjs';

export function goRouteRule(finding) {
  return GO_LINT_TOOLS.includes(finding.tool)
    ? `${finding.tool}/${finding.rule}`
    : sharedRouteRule(finding);
}

function formatterFindings(context) {
  return Object.entries(readFormatReport(context.reportRoot)).flatMap(([formatter, files]) =>
    formatFindings({ formatter, from: context.formatting.from, files }),
  );
}

function deadCodeFindings(context, policy) {
  const facts = readGoFacts(context);
  const factFindings = goFactFindings(facts, policy);
  const testOnly = factFindings.filter(({ rule }) => rule === UNUSED_API_RULE_IDS.testOnlyExport);
  return [
    ...factFindings,
    ...readDeadcodeFindings(context, { facts, testOnly }),
    ...readTidyFindings(context),
  ];
}

export function readGoFindings(context, policy = {}) {
  const report = readInspect(context.reportRoot);
  const testRun = readTestRun(context.reportRoot);
  return [
    ...formatterFindings(context),
    ...readVetFindings(context),
    ...testRunFindings(testRun, context.snapshot),
    ...goSlowTestFindings(context, testRun, report),
    ...goStructureFindings(report, context.projectRoot, policy),
    ...readGoDuplicateFindings(context.reportRoot, context.projectRoot),
    ...goCouplingFindings(report, context.module),
    ...deadCodeFindings(context, policy),
  ];
}
