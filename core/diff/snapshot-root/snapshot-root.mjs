import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';

function escaped(text) {
  return text.replaceAll(/[\\^$.*+?()[\]{}|]/gu, String.raw`\$&`);
}

export function withoutSnapshotRoot(text, snapshotRoot) {
  if (snapshotRoot === undefined || typeof text !== 'string') {
    return text;
  }
  const { projectRoot, snapshot } = snapshotRoot;
  const roots = existsSync(projectRoot) ? [projectRoot, realpathSync(projectRoot)] : [projectRoot];
  const spellings = [
    ...new Set(roots.flatMap((root) => [root, root.split(path.sep).join('/')])),
  ].sort((left, right) => right.length - left.length);
  const root = new RegExp(
    `(?:${spellings.map(escaped).join('|')})(?:[\\\\/]|(?![\\w-]|\\.\\w))`,
    'gu',
  );
  return text.replaceAll(root, (match) => (/[\\/]$/u.test(match) ? '' : snapshot));
}

function namedFinding(finding, snapshotRoot) {
  return finding?.classification === 'tool-error' && typeof finding.message === 'string'
    ? { ...finding, message: withoutSnapshotRoot(finding.message, snapshotRoot) }
    : finding;
}

export function namedToolErrors(toolErrors, snapshotRoot) {
  return toolErrors.map((error) => ({
    ...error,
    message: withoutSnapshotRoot(error.message, snapshotRoot),
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
