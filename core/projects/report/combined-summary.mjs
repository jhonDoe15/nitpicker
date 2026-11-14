import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { reportFolder } from '../plan/project-entry.mjs';

const REPORT_FILE = 'report.txt';
export const SUMMARY_FILE = 'summary.json';

function repositoryFailed(repository) {
  return repository !== undefined && !repository.accepted;
}

function repositoryIncomplete(repository) {
  return (repository?.toolErrors ?? []).length > 0;
}

export function exitCodeOf(summary, { deferExit = false } = {}) {
  const { projects, repositoryPolicy } = summary;
  const incomplete = repositoryIncomplete(repositoryPolicy);
  if (deferExit) {
    return incomplete || projects.some(({ overallStatus }) => overallStatus === 'tool-error')
      ? 2
      : 0;
  }
  if (repositoryFailed(repositoryPolicy) || projects.some(({ status }) => status === 'failed')) {
    return 1;
  }
  return incomplete || projects.some(({ status }) => status === 'error') ? 2 : 0;
}

function countOf(results, status) {
  return results.filter((result) => result.status === status).length;
}

function ranFields(outcome, folder) {
  return {
    overallStatus: outcome.complete ? 'completed' : 'tool-error',
    exitCode: outcome.exitCode,
    newEnforceableFindings: outcome.newEnforceableFindings,
    toolErrors: outcome.toolErrors,
    report: folder,
    summary: `${folder}/${SUMMARY_FILE}`,
  };
}

function entryOf(result) {
  const { project, selection, outcome } = result;
  return {
    path: project.path,
    preset: project.preset,
    status: outcome === undefined ? 'skipped' : outcome.status,
    reason: selection.reason,
    ...(outcome === undefined ? {} : ranFields(outcome, reportFolder(project.path))),
    ...(outcome?.policyDigest === undefined ? {} : { policyDigest: outcome.policyDigest }),
    ...(outcome?.error === undefined ? {} : { error: outcome.error }),
  };
}

function repositoryFields(repository) {
  if (repository === undefined) {
    return {};
  }
  const { findings, ...fields } = repository;
  return { repositoryPolicy: { ...fields, newEnforceableFindings: findings.length } };
}

export function combinedSummary({ plan, results, outside, notices, repository, elapsedMs }) {
  const projects = results.map(entryOf);
  const incomplete = projects.filter(({ overallStatus }) => overallStatus === 'tool-error');
  const ownFindings = projects.reduce(
    (total, { newEnforceableFindings = 0 }) => total + newEnforceableFindings,
    0,
  );
  return {
    source: plan.source,
    overallStatus:
      incomplete.length > 0 || repositoryIncomplete(repository) ? 'tool-error' : 'completed',
    newEnforceableFindings: ownFindings + (repository?.findings.length ?? 0),
    counts: {
      projects: projects.length,
      run: projects.length - countOf(projects, 'skipped'),
      passed: countOf(projects, 'passed'),
      failed: countOf(projects, 'failed'),
      errored: countOf(projects, 'error'),
      incomplete: incomplete.length,
      skipped: countOf(projects, 'skipped'),
    },
    projects,
    ...repositoryFields(repository),
    outsideProjects: outside,
    notices,
    elapsedMs,
  };
}

export function writeCombinedReports(outputRoot, summary, text) {
  mkdirSync(outputRoot, { recursive: true });
  writeFileSync(path.join(outputRoot, SUMMARY_FILE), `${JSON.stringify(summary, null, 2)}\n`);
  writeFileSync(path.join(outputRoot, REPORT_FILE), text);
}
