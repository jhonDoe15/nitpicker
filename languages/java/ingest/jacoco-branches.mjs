import { MINIMUM_BRANCH_COVERAGE } from '../../../shared/policy.mjs';
import { branchCoverageFindings } from '../../../shared/rules/branch-coverage.mjs';
import { childrenNamed, hashIdentity, normalizeReportPath, parseXml } from './common.mjs';

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
      findings.push(...sourcefileFindings(sourcefile, pkg, { options, tool, minimum }));
    }
  }
  return { findings };
}

function sourcefileFindings(sourcefile, pkg, { options, tool, minimum }) {
  const filePath = normalizeReportPath(
    [options.sourceRoot, pkg.attrs.name, sourcefile.attrs.name].filter(Boolean).join('/'),
  );
  const text = filePath === undefined ? undefined : options.sourceText?.(filePath);
  if (text === undefined) {
    return [];
  }
  return fileFindings(
    sourcefile,
    { path: filePath, lines: text.split(/\r?\n/) },
    { tool, minimum },
  );
}

function fileFindings(sourcefile, { path: filePath, lines: sourceLines }, { tool, minimum }) {
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
