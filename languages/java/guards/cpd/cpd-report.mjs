import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { rootsScope } from '../../builds/module-path.mjs';
import { reportRootPattern } from '../../builds/tools/tool-commands.mjs';
import { childrenNamed, parseXml } from '../../../../shared/ingest/common.mjs';

const CPD_REPORT = 'cpd.xml';
const CPD_FAILURE = 'cpd-failed.txt';
const CPD_NOT_RUN = 'cpd-not-run';
const CPD_SKIPPED = 'cpd-skipped.txt';
const CPD_SKIPPED_RULE = 'cpd-skipped-paths';
const CPD_ROOT = reportRootPattern('cpd');
const JVM_NOTE = /^(?:NOTE: )?Picked up \w+/u;
const MAX_ERROR_LINES = 10;
const DUPLICATES_TOOL = 'duplicates';
export const CPD_IDENTITY_PREFIX = 'cpd:';

function cpdFailure(reportRoot) {
  const [status, ...stderr] = readFileSync(path.join(reportRoot, CPD_FAILURE), 'utf8').split(
    /\r?\n/u,
  );
  const errors = stderr.filter((line) => line.trim() !== '' && !JVM_NOTE.test(line));
  const detail = errors.slice(0, MAX_ERROR_LINES).join('\n') || 'no error output';
  return { kind: 'failed', reason: `PMD CPD ${failedRun(status)} and wrote no report: ${detail}` };
}

function failedRun(status) {
  if (/^\d+$/u.test(status)) {
    return `exited with code ${status}`;
  }
  if (status === 'ETIMEDOUT') {
    return 'did not finish within the tool timeout';
  }
  return /^SIG[A-Z0-9]+$/u.test(status) ? `was stopped by ${status}` : `could not run (${status})`;
}

function lexErrors(xml) {
  return childrenNamed(parseXml(xml), 'error').map(
    (error) => `${error.attrs.filename}: ${error.attrs.msg}`,
  );
}

export function skippedPaths(reportRoot, { projectRoot, xml }) {
  const file = path.join(reportRoot, CPD_SKIPPED);
  const unread = existsSync(file) ? readFileSync(file, 'utf8').split(/\r?\n/u) : [];
  const lines = [
    ...new Set(
      [...unread, ...lexErrors(xml)]
        .filter((line) => line.trim() !== '')
        .map((line) => line.replaceAll(`${projectRoot}${path.sep}`, '')),
    ),
  ];
  if (lines.length === 0) {
    return [];
  }
  return [
    {
      tool: DUPLICATES_TOOL,
      rule: CPD_SKIPPED_RULE,
      path: '.',
      identity: CPD_SKIPPED_RULE,
      message:
        `CPD could not read or tokenize ${String(lines.length)} path(s), so duplicated code there ` +
        `was not checked: ${lines.slice(0, MAX_ERROR_LINES).join('; ')}`,
      classification: 'descriptive',
    },
  ];
}

export function readCpdReport(reportRoot) {
  if (existsSync(path.join(reportRoot, CPD_FAILURE))) {
    return cpdFailure(reportRoot);
  }
  const report = path.join(reportRoot, CPD_REPORT);
  if (!existsSync(report)) {
    return { kind: 'missing' };
  }
  const xml = readFileSync(report, 'utf8');
  return CPD_ROOT.test(xml)
    ? { kind: 'report', xml }
    : {
        kind: 'failed',
        reason: `PMD CPD wrote ${xml.trim() === '' ? 'an empty' : 'a non-XML'} ${CPD_REPORT}`,
      };
}

export function cpdNotRun(reason, roots, module) {
  const scope = rootsScope(roots, module);
  const place =
    scope.length === 0
      ? 'its source roots, which lie outside the project,'
      : scope.map((directory) => (directory === '.' ? 'the module root' : directory)).join(', ');
  return {
    tool: DUPLICATES_TOOL,
    rule: CPD_NOT_RUN,
    path: '.',
    identity: CPD_NOT_RUN,
    message: `No CPD duplicate report for this module, so duplicated code in ${place} was not checked: ${reason}`,
    classification: 'descriptive',
    ...(scope.length === 0
      ? {}
      : { toolNotRun: true, notRunScope: scope, notRunIdentityPrefix: CPD_IDENTITY_PREFIX }),
  };
}
