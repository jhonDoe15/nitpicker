import { MINIMUM_BRANCH_COVERAGE, RULE_IDS } from '../../shared/policy.mjs';
import { branchCoverageFindings } from '../../shared/rules/branch-coverage.mjs';
import { childrenNamed, hashIdentity, normalizeReportPath, parseXml } from './common.mjs';

// JaCoCo XML -> `changed-branch-coverage` findings, the Java counterpart of the TypeScript
// coverage check: one enforceable finding per source line whose branch outcomes are covered below
// `minimum` percent (default 95; lines without branches are never reported).
//
// The report knows nothing about changes. Like every other finding, these are emitted for every
// snapshot, so an uncovered branch that already exists on the base is baselined. What makes it a
// *changed* branch is the differential gate: a finding whose head line lies in a range changed
// since the merge base counts as new (see adapters/java/touched-rules.mjs, wired into `isStrictRule` of preset/strict-rules.mjs, and
// `compareFindings`' `touchedCode`), which is the head-vs-base line mapping from git.
//
// Identity never contains a line number: it is a hash of the line's trimmed source text with
// whitespace collapsed, plus a `#n` suffix for the n-th identical line in one file. `location.line` is
// only for display and for the changed-range check.
// `options.sourceRoot` is prepended to JaCoCo's package-relative paths; `options.sourceText(path)`
// returns the project-relative file's text (files it cannot read are skipped).

export const CHANGED_BRANCH_COVERAGE_RULE = RULE_IDS.changedBranchCoverage;

export function ingestJacocoBranches(xml, options = {}) {
  const report = parseXml(xml);
  if (report.name !== 'report') {
    throw new TypeError('JaCoCo report root element must be <report>');
  }
  const tool = options.tool ?? 'jacoco';
  const minimum = options.minimum ?? MINIMUM_BRANCH_COVERAGE;
  const findings = [];
  for (const pkg of childrenNamed(report, 'package')) {
    for (const sourcefile of childrenNamed(pkg, 'sourcefile')) {
      const filePath = normalizeReportPath(
        [options.sourceRoot, pkg.attrs.name, sourcefile.attrs.name].filter(Boolean).join('/'),
      );
      const text = filePath === undefined ? undefined : options.sourceText?.(filePath);
      if (text === undefined) {
        continue;
      }
      findings.push(...fileFindings(sourcefile, filePath, text.split(/\r?\n/), { tool, minimum }));
    }
  }
  return { findings };
}

function fileFindings(sourcefile, filePath, sourceLines, { tool, minimum }) {
  const branches = [];
  for (const line of childrenNamed(sourcefile, 'line')) {
    const missed = Number.parseInt(line.attrs.mb, 10);
    const covered = Number.parseInt(line.attrs.cb, 10);
    const lineNumber = Number.parseInt(line.attrs.nr, 10);
    const total = missed + covered;
    const source = sourceLines[lineNumber - 1]?.trim().replaceAll(/\s+/g, ' ');
    if (!(total > 0) || !Number.isInteger(lineNumber) || source === undefined || source === '') {
      continue;
    }
    branches.push({
      path: filePath,
      key: hashIdentity('branch-source', [source]),
      percent: (covered / total) * 100,
      line: lineNumber,
    });
  }
  return branchCoverageFindings(branches, {
    tool,
    minimum,
    identify: (key, occurrence) => (occurrence === 1 ? key : `${key}#${String(occurrence)}`),
  });
}
