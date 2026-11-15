import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { withoutAnsi } from '../../../shared/messages/terminal/terminal-text.mjs';
import { escapeRegExp } from '../../../shared/paths/glob.mjs';
import { withMessage } from '../../../shared/messages/advice/finding-advice.mjs';

export function withoutSnapshotRoot(text, snapshotRoot) {
  if (snapshotRoot === undefined || typeof text !== 'string') {
    return text;
  }
  const { projectRoot, snapshot } = snapshotRoot;
  const roots = existsSync(projectRoot) ? [projectRoot, realpathSync(projectRoot)] : [projectRoot];
  const spellings = [
    ...new Set(roots.flatMap((root) => [root, root.split(path.sep).join('/')])),
  ].sort((left, right) => right.length - left.length);
  const pattern = new RegExp(
    `(?:${spellings.map(escapeRegExp).join('|')})(?:[\\\\/]|(?![\\w-]|\\.\\w))`,
    'gu',
  );
  return text.replaceAll(pattern, (match) => (/[\\/]$/u.test(match) ? '' : snapshot));
}

function namedFinding(finding, snapshotRoot) {
  return finding?.classification === 'tool-error' && typeof finding.message === 'string'
    ? withMessage(finding, {
        message: withoutSnapshotRoot(finding.message, snapshotRoot),
        allowedForm: withoutSnapshotRoot(finding.allowedForm, snapshotRoot),
      })
    : finding;
}

export function namedToolErrors(toolErrors, snapshotRoot) {
  return toolErrors.map((error) => ({
    ...error,
    message: withoutAnsi(withoutSnapshotRoot(error.message, snapshotRoot)),
  }));
}

export function namedReports(reports, snapshotRoot) {
  return new Map(
    [...reports].map(([name, report]) => [
      name,
      Array.isArray(report?.findings)
        ? {
            ...report,
            findings: report.findings.map((finding) => namedFinding(finding, snapshotRoot)),
          }
        : report,
    ]),
  );
}
