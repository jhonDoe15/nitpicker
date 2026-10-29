import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

function readJson(file) {
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : undefined;
}

function readCounts(reportRoot) {
  const summary = readJson(path.join(reportRoot, 'summary.json')) ?? {};
  const toolErrors = readJson(path.join(reportRoot, 'tool-errors.json')) ?? [];
  return {
    newEnforceableFindings: summary.newEnforceableFindings ?? summary.enforceableFindings ?? 0,
    toolErrors: toolErrors.length,
    ...(summary.policyDigest === undefined ? {} : { policyDigest: summary.policyDigest }),
  };
}

function statusOf({ exitCode, newEnforceableFindings, toolErrors, error }) {
  if (error !== undefined) {
    return 'error';
  }
  if (newEnforceableFindings > 0) {
    return 'failed';
  }
  return toolErrors > 0 || exitCode === 2 ? 'error' : 'passed';
}

export function outcomeOf({ exitCode, reportRoot, error }) {
  const counts =
    error === undefined ? readCounts(reportRoot) : { newEnforceableFindings: 0, toolErrors: 0 };
  const facts = { exitCode, ...counts, error };
  return {
    exitCode,
    ...counts,
    ...(error === undefined ? {} : { error }),
    status: statusOf(facts),
    complete: error === undefined && counts.toolErrors === 0 && exitCode !== 2,
  };
}
