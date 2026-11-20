import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { withoutAnsi } from '../../../shared/messages/terminal/terminal-text.mjs';
import { escapeRegExp } from '../../../shared/paths/glob.mjs';
import { withMessage } from '../../../shared/messages/advice/finding-advice.mjs';
import type { AnalyzerReport, Finding, ReportEntry } from '../../../shared/values/findings.mts';

export type SnapshotRoot = { readonly projectRoot: string; readonly snapshot: string };

const messaged: (
  finding: Finding,
  advice: { readonly message: string; readonly allowedForm: string | undefined },
) => Readonly<Record<string, unknown>> = withMessage;

const ansiFree: (text: string) => string = withoutAnsi;

function isFinding(value: Readonly<Record<string, unknown>>): value is Finding {
  return typeof value['message'] === 'string' && typeof value['classification'] === 'string';
}

export function withoutSnapshotRoot(text: string, snapshotRoot: SnapshotRoot | undefined): string;
export function withoutSnapshotRoot(
  text: string | undefined,
  snapshotRoot: SnapshotRoot | undefined,
): string | undefined;
export function withoutSnapshotRoot(
  text: string | undefined,
  snapshotRoot: SnapshotRoot | undefined,
): string | undefined {
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

function namedFinding(finding: Finding, snapshotRoot: SnapshotRoot | undefined): Finding {
  if (finding.classification !== 'tool-error') {
    return finding;
  }
  const allowedForm = finding['allowedForm'];
  const named = messaged(finding, {
    message: withoutSnapshotRoot(finding.message, snapshotRoot),
    allowedForm: withoutSnapshotRoot(
      typeof allowedForm === 'string' ? allowedForm : undefined,
      snapshotRoot,
    ),
  });
  if (!isFinding(named)) {
    throw new TypeError('renamed finding lost its fields');
  }
  return named;
}

export function namedToolErrors(
  toolErrors: readonly ReportEntry[],
  snapshotRoot: SnapshotRoot | undefined,
): ReportEntry[] {
  return toolErrors.map((error) => ({
    ...error,
    message:
      typeof error.message === 'string'
        ? ansiFree(withoutSnapshotRoot(error.message, snapshotRoot))
        : error.message,
  }));
}

export function namedReports(
  reports: ReadonlyMap<string, AnalyzerReport>,
  snapshotRoot: SnapshotRoot | undefined,
): Map<string, AnalyzerReport> {
  return new Map(
    [...reports].map(([name, report]) => [
      name,
      Array.isArray(report.findings)
        ? {
            ...report,
            findings: report.findings.map((finding: Finding) =>
              namedFinding(finding, snapshotRoot),
            ),
          }
        : report,
    ]),
  );
}
