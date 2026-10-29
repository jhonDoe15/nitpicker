import { MINIMUM_BRANCH_COVERAGE } from '../../../../shared/policy.mjs';
import { branchCoverageFindings } from '../../../../shared/rules/branch-coverage.mjs';
import { enclosingFunctionName } from '../../../../shared/rules/finding-helpers.mjs';
import {
  childrenNamed,
  hashIdentity,
  normalizeReportPath,
  parseXml,
} from '../../../../shared/ingest/common.mjs';
import { formatAgnosticText } from '../../../../shared/source-text/format-tokens.mjs';
import { isCompilerGeneratedBranchLine, suspensionCall } from './kotlin-branches.mjs';

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
  const filePath = locateSource(pkg.attrs.name, sourcefile.attrs.name, options);
  const text = filePath === undefined ? undefined : options.sourceText?.(filePath);
  if (text === undefined) {
    return unresolvedKotlinFinding(sourcefile, pkg, tool);
  }
  return fileFindings(
    sourcefile,
    { path: filePath, lines: text.split(/\r?\n/) },
    {
      tool,
      minimum,
      functions: [...(options.functions ?? []), ...(options.units?.(filePath, text) ?? [])],
    },
  );
}

function locateSource(packageName, fileName, options) {
  if (options.locate !== undefined) {
    return options.locate(packageName, fileName);
  }
  return normalizeReportPath([options.sourceRoot, packageName, fileName].filter(Boolean).join('/'));
}

function unresolvedKotlinFinding(sourcefile, pkg, tool) {
  const name = sourcefile.attrs.name;
  const missed = childrenNamed(sourcefile, 'line').reduce(
    (sum, line) => sum + (Number.parseInt(line.attrs.mb, 10) || 0),
    0,
  );
  if (!name.endsWith('.kt') || missed === 0 || /^kotlinx?(\/|$)/.test(pkg.attrs.name)) {
    return [];
  }
  return [
    {
      tool,
      rule: 'branch-source-not-found',
      path: normalizeReportPath(`${pkg.attrs.name}/${name}`) ?? name,
      identity: 'branch-source-not-found',
      message: `Source file not found, so its ${String(missed)} missed branches are not checked. Put it under a Kotlin source root and declare its package`,
      classification: 'descriptive',
    },
  ];
}

function fileFindings(sourcefile, file, { tool, minimum, functions }) {
  const branches = childrenNamed(sourcefile, 'line')
    .map((line) => lineBranch(line, file))
    .filter((branch) => branch !== undefined)
    .map((branch) => ({
      ...branch,
      symbol: enclosingFunctionName(functions, branch.path, branch.line),
    }));
  return branchCoverageFindings(branches, {
    tool,
    minimum,
    identify: (key, occurrence) => (occurrence === 1 ? key : `${key}#${String(occurrence)}`),
  });
}

function lineBranch(line, { path: filePath, lines: sourceLines }) {
  const missed = Number.parseInt(line.attrs.mb, 10);
  const covered = Number.parseInt(line.attrs.cb, 10);
  const lineNumber = Number.parseInt(line.attrs.nr, 10);
  const total = missed + covered;
  const source = sourceLines[lineNumber - 1]?.trim().replaceAll(/\s+/g, ' ');
  if (!(total > 0) || !Number.isInteger(lineNumber) || !source) {
    return undefined;
  }
  const kotlin = filePath.endsWith('.kt');
  if (kotlin && isCompilerGeneratedBranchLine(source)) {
    return undefined;
  }
  const suspension = kotlin ? suspensionCall(source) : undefined;
  return {
    path: filePath,
    key: hashIdentity('branch-source', [formatAgnosticText(source, filePath)]),
    percent: (covered / total) * 100,
    line: lineNumber,
    ...(suspension === undefined ? {} : { arms: [suspensionArm(suspension)] }),
  };
}

function suspensionArm(call) {
  return `${call} suspending (move the call to its own line if no branch of yours is untested)`;
}
