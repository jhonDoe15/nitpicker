import { readFileSync } from 'node:fs';
import path from 'node:path';
import { sharedRouteRule } from '../../../shared/exceptions/routes.mjs';
import { VET_REPORT, vetFindings } from './build/go-vet.mjs';
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

export function readGoFindings(context, policy = {}) {
  const report = readInspect(context.reportRoot);
  const testRun = readTestRun(context.reportRoot);
  return [
    ...formatterFindings(context),
    ...vetFindings(
      context.projectRoot,
      readFileSync(path.join(context.reportRoot, VET_REPORT), 'utf8'),
    ),
    ...testRunFindings(testRun, context.snapshot),
    ...goSlowTestFindings(context, testRun, report),
    ...goStructureFindings(report, context.projectRoot, policy),
  ];
}
