import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { reportFolder } from './outcome.mjs';

const REPORT_FILE = 'report.txt';
const SUMMARY_FILE = 'summary.json';

export function exitCodeOf(results, { deferExit = false } = {}) {
  if (deferExit) {
    return 0;
  }
  if (results.some(({ status }) => status === 'failed')) {
    return 1;
  }
  return results.some(({ status }) => status === 'error') ? 2 : 0;
}

function countOf(results, status) {
  return results.filter((result) => result.status === status).length;
}

function entryOf(result) {
  const { project, selection, outcome } = result;
  const folder = reportFolder(project.path);
  const ran = outcome !== undefined;
  return {
    path: project.path,
    preset: project.preset,
    status: ran ? outcome.status : 'skipped',
    reason: selection.reason,
    ...(ran
      ? {
          exitCode: outcome.exitCode,
          newEnforceableFindings: outcome.newEnforceableFindings,
          toolErrors: outcome.toolErrors,
          report: folder,
          summary: `${folder}/${SUMMARY_FILE}`,
        }
      : {}),
    ...(outcome?.policyDigest === undefined ? {} : { policyDigest: outcome.policyDigest }),
    ...(outcome?.error === undefined ? {} : { error: outcome.error }),
  };
}

export function combinedSummary({ plan, results, outside, elapsedMs }) {
  const projects = results.map(entryOf);
  const hasError = projects.some(({ status }) => status === 'error');
  return {
    source: plan.source,
    overallStatus: hasError ? 'tool-error' : 'completed',
    newEnforceableFindings: projects.reduce(
      (total, { newEnforceableFindings = 0 }) => total + newEnforceableFindings,
      0,
    ),
    counts: {
      projects: projects.length,
      run: projects.length - countOf(projects, 'skipped'),
      passed: countOf(projects, 'passed'),
      failed: countOf(projects, 'failed'),
      errored: countOf(projects, 'error'),
      skipped: countOf(projects, 'skipped'),
    },
    projects,
    outsideProjects: outside,
    elapsedMs,
  };
}

export function writeCombinedReports(outputRoot, summary, text) {
  mkdirSync(outputRoot, { recursive: true });
  writeFileSync(path.join(outputRoot, SUMMARY_FILE), `${JSON.stringify(summary, null, 2)}\n`);
  writeFileSync(path.join(outputRoot, REPORT_FILE), text);
}
