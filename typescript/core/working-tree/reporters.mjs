import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const REPORT_FILE_NAMES = [
  'summary.json',
  'changed-files.json',
  'findings.json',
  'tool-errors.json',
  'report.txt',
];
const LOG_FILE_NAMES = [
  'eslint-fix.log',
  'prettier-base-check.log',
  'prettier-fix.log',
  'eslint-check.log',
  'prettier-check.log',
];

export function clearWorkingTreeReports(outputRoot) {
  for (const fileName of REPORT_FILE_NAMES) {
    rmSync(path.join(outputRoot, fileName), { force: true });
  }
  for (const fileName of LOG_FILE_NAMES) {
    rmSync(path.join(outputRoot, 'logs', fileName), { force: true });
  }
}

export function writeWorkingTreeReport(outputRoot, report) {
  mkdirSync(outputRoot, { recursive: true });
  const text = renderWorkingTreeReport(report);
  writeJson(path.join(outputRoot, 'summary.json'), report.summary);
  writeJson(path.join(outputRoot, 'changed-files.json'), report.changes);
  writeJson(path.join(outputRoot, 'findings.json'), report.findings);
  writeJson(path.join(outputRoot, 'tool-errors.json'), report.toolErrors);
  writeFileSync(path.join(outputRoot, 'report.txt'), text);
  return text;
}

export function renderWorkingTreeReport(report) {
  const lines = [
    'Nitpicker working-tree quality',
    `Base ref: ${report.summary.requestedBaseRef}`,
    `Merge base: ${report.summary.mergeBaseSha}`,
    `Head: ${report.summary.headSha}`,
    `Status: ${report.summary.status}`,
    `Changed paths: ${String(report.summary.changedPaths)}`,
    `Checked files: ${String(report.summary.checkedFiles)}`,
    `Findings: ${String(report.findings.length)}`,
    `Tool errors: ${String(report.toolErrors.length)}`,
  ];
  if (report.summary.fixSafe) {
    lines.push(
      `Safe fixes: ESLint=${String(report.summary.eslintFixFiles)}, Prettier=${String(report.summary.prettierFixFiles)}, Prettier skipped=${String(report.summary.prettierFixSkipped)}`,
    );
  }

  appendFindings(lines, report.findings);
  appendToolErrors(lines, report.toolErrors);
  if (report.summary.changedPaths === 0) {
    lines.push('', 'No changes relative to the requested base or in the working tree.');
  } else if (report.summary.checkedFiles === 0) {
    lines.push('', 'No supported changed files to check.');
  }
  lines.push('', `Full logs: ${report.summary.outputRoot}/logs/`);
  return `${lines.join('\n')}\n`;
}

function appendFindings(lines, findings) {
  if (findings.length === 0) {
    return;
  }
  lines.push('', 'Findings by file and rule:');
  const byPath = groupBy([...findings].sort(compareFindings), ({ path: filePath }) => filePath);
  for (const [filePath, fileFindings] of byPath) {
    lines.push(`${filePath}:`);
    const byRule = groupBy(fileFindings, ({ rule }) => rule);
    for (const [rule, ruleFindings] of byRule) {
      lines.push(`  ${rule}:`);
      for (const finding of ruleFindings) {
        const location =
          finding.location === undefined
            ? ''
            : `${String(finding.location.line)}:${String(finding.location.column)} `;
        lines.push(`    ${location}${singleLine(finding.message)}`);
      }
    }
  }
}

function appendToolErrors(lines, toolErrors) {
  if (toolErrors.length === 0) {
    return;
  }
  lines.push('', 'Tool errors:');
  for (const error of toolErrors) {
    const filePath = error.path === undefined ? '' : ` (${error.path})`;
    lines.push(`  ${error.tool}${filePath}: ${singleLine(error.message)}`);
  }
}

function compareFindings(left, right) {
  return (
    left.path.localeCompare(right.path) ||
    left.rule.localeCompare(right.rule) ||
    (left.location?.line ?? 0) - (right.location?.line ?? 0) ||
    (left.location?.column ?? 0) - (right.location?.column ?? 0) ||
    left.message.localeCompare(right.message)
  );
}

function singleLine(value) {
  return String(value).replaceAll(/\s+/g, ' ').trim();
}

function groupBy(values, keyFor) {
  const groups = new Map();
  for (const value of values) {
    const key = keyFor(value);
    const group = groups.get(key) ?? [];
    group.push(value);
    groups.set(key, group);
  }
  return groups;
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}
