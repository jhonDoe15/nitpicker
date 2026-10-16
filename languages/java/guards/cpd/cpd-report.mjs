import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { rootsScope } from '../../builds/module-path.mjs';

const CPD_REPORT = 'cpd.xml';
const CPD_FAILURE = 'cpd-failed.txt';
const CPD_NOT_RUN = 'cpd-not-run';
const CPD_SKIPPED = 'cpd-skipped.txt';
const CPD_SKIPPED_RULE = 'cpd-skipped-paths';
const CPD_ROOT = /<pmd-cpd[\s/>]/u;
const JVM_NOTE = /^(?:NOTE: )?Picked up \w+/u;
const MAX_ERROR_LINES = 10;
const DUPLICATES_TOOL = 'duplicates';

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

export function skippedPaths(reportRoot, projectRoot) {
  const file = path.join(reportRoot, CPD_SKIPPED);
  if (!existsSync(file)) {
    return [];
  }
  const lines = readFileSync(file, 'utf8')
    .split(/\r?\n/u)
    .filter((line) => line.trim() !== '')
    .map((line) => line.replaceAll(`${projectRoot}${path.sep}`, ''));
  return [
    {
      tool: DUPLICATES_TOOL,
      rule: CPD_SKIPPED_RULE,
      path: '.',
      identity: CPD_SKIPPED_RULE,
      message:
        `CPD could not read ${String(lines.length)} path(s), so duplicated code there was not ` +
        `checked: ${lines.slice(0, MAX_ERROR_LINES).join('; ')}`,
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

export function cpdNotRun(reason, roots, moduleDir) {
  const scope = rootsScope(roots, moduleDir);
  const place = scope
    .map((directory) => (directory === '.' ? 'the module root' : directory))
    .join(', ');
  return {
    tool: DUPLICATES_TOOL,
    rule: CPD_NOT_RUN,
    path: '.',
    identity: CPD_NOT_RUN,
    message: `No CPD duplicate report for this module, so duplicated code in ${place} was not checked: ${reason}`,
    classification: 'descriptive',
    toolNotRun: true,
    notRunScope: scope,
  };
}
