import { readFileSync } from 'node:fs';
import path from 'node:path';
import { sharedRouteRule } from '../../../shared/exceptions/routes.mjs';
import { VET_REPORT, vetFindings } from './build/go-vet.mjs';
import { GO_LINT_TOOLS } from './configuration/go-config.mjs';
import { formatFindings } from './formatting/go-format.mjs';
import { lintFindings } from './lint/go-lint.mjs';
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

export function readGoFindings(context, policy = {}) {
  const report = readInspect(context.reportRoot);
  const testRun = readTestRun(context.reportRoot);
  const formatReport = readFormatReport(context.reportRoot);
  return [
    ...formatterFindings(context, formatReport),
    ...vetFindings(
      context.projectRoot,
      readFileSync(path.join(context.reportRoot, VET_REPORT), 'utf8'),
    ),
    ...withoutGofumptOverlap(lintFindings(context), formatReport),
    ...testRunFindings(testRun, context.snapshot),
    ...goSlowTestFindings(context, testRun, report),
    ...goStructureFindings(report, context.projectRoot, policy),
  ];
}
