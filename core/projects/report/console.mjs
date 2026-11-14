import { CONFIG_FILE_NAME } from '../../../shared/config.mjs';

const MAX_LISTED_FILES = 5;
const MARKS = { passed: '✓', failed: '✖', error: '!', skipped: '-' };

function count(total, word) {
  return `${String(total)} ${word}${total === 1 ? '' : 's'}`;
}

function originsOf(plan) {
  return [...new Set(plan.projects.map(({ origin }) => origin))].join(', ');
}

function introduction(plan) {
  const total = count(plan.projects.length, 'project');
  if (plan.source === 'declared') {
    return `Monorepo: ${total} listed in "projects" of ${CONFIG_FILE_NAME}.`;
  }
  return (
    `Monorepo: ${total} detected (${originsOf(plan)}). ` +
    `List them in "projects" of ${CONFIG_FILE_NAME} to choose them; ` +
    '"projects": [] keeps this repository one project.'
  );
}

function planLine({ project, selection }) {
  const verb = selection.selected ? 'run ' : 'skip';
  return `  ${verb} ${project.path} (${project.preset}): ${selection.reason}`;
}

function skippedLines(entries, reasonOf) {
  const byReason = new Map();
  for (const entry of entries) {
    const reason = reasonOf(entry);
    byReason.set(reason, (byReason.get(reason) ?? 0) + 1);
  }
  return [...byReason].map(
    ([reason, total]) => `  skip ${count(total, 'project')}: ${reason} (--details lists them)`,
  );
}

function planLines(rows, details) {
  if (details) {
    return rows.map(planLine);
  }
  const ran = rows.filter(({ selection }) => selection.selected);
  const skipped = rows.filter(({ selection }) => !selection.selected);
  return [...ran.map(planLine), ...skippedLines(skipped, ({ selection }) => selection.reason)];
}

function outsideLine(outside) {
  if (outside.length === 0) {
    return [];
  }
  const listed = outside.slice(0, MAX_LISTED_FILES).join(', ');
  const more =
    outside.length > MAX_LISTED_FILES
      ? ` and ${String(outside.length - MAX_LISTED_FILES)} more`
      : '';
  return [`Changed files outside every project, not checked: ${listed}${more}`];
}

export function renderPlan({ plan, rows, outside, details = false }) {
  const lines = [introduction(plan), ...planLines(rows, details), ...outsideLine(outside)];
  return `${lines.join('\n')}\n`;
}

function firstLine(text) {
  return text.split('\n')[0];
}

function resultText({ status, newEnforceableFindings, reason, error, overallStatus, report }) {
  if (status === 'skipped') {
    return `skipped (${reason})`;
  }
  if (status === 'error') {
    return error === undefined
      ? 'tool errors, the run is incomplete'
      : `failed to run: ${firstLine(error)}${report === undefined ? '' : ` (${report}/report.txt)`}`;
  }
  if (status === 'passed') {
    return 'no new violations';
  }
  const found = count(newEnforceableFindings, 'new enforceable violation');
  return overallStatus === 'tool-error'
    ? `${found}, and tool errors: the run is incomplete`
    : found;
}

function headline({ counts }) {
  const parts = [
    [counts.failed, 'failed'],
    [counts.errored, 'incomplete'],
    [counts.passed, 'passed'],
    [counts.skipped, 'skipped'],
  ]
    .filter(([total]) => total > 0)
    .map(([total, word]) => `${String(total)} ${word}`);
  return `Monorepo summary: ${parts.join(', ')} (${count(counts.projects, 'project')})`;
}

function repositoryLines(repository) {
  if (repository === undefined) {
    return [];
  }
  const mark = repository.accepted ? '✓' : '✖';
  const state = repository.accepted ? 'accepted' : 'not accepted';
  return [
    ...repository.policyLoosenings.map(
      (text) =>
        `  ${mark} repository policy (${state}, digest ${repository.policyDigest}): ${text}`,
    ),
    ...(repository.toolErrors ?? []).map(
      ({ message }) => `  ! repository policy, the run is incomplete: ${message}`,
    ),
  ];
}

function acceptanceLine(projects, repository) {
  const own = projects.flatMap(({ policyDigest }) =>
    policyDigest === undefined ? [] : [policyDigest],
  );
  const pending = repository === undefined || repository.accepted ? [] : [repository.policyDigest];
  const digests = [...own, ...pending];
  if (digests.length < 2 && pending.length === 0) {
    return [];
  }
  const places =
    pending.length === 0
      ? `${String(own.length)} projects`
      : ['the repository policy', ...(own.length === 0 ? [] : [count(own.length, 'project')])].join(
          ' and ',
        );
  return [
    `Policy loosenings in ${places}. ` +
      `A person who accepts them all sets NITPICKER_ACCEPT_POLICY_CHANGE=${digests.join(',')} in CI.`,
  ];
}

function summaryLine(entry) {
  return `  ${MARKS[entry.status]} ${entry.path} (${entry.preset}): ${resultText(entry)}`;
}

function summaryLines(projects, details) {
  if (details) {
    return projects.map(summaryLine);
  }
  const ran = projects.filter(({ status }) => status !== 'skipped');
  const skipped = projects.filter(({ status }) => status === 'skipped');
  return [
    ...ran.map(summaryLine),
    ...skippedLines(skipped, ({ reason }) => reason).map((line) =>
      line.replace('  skip ', `  ${MARKS.skipped} `),
    ),
  ];
}

export function renderSummary({ summary, summaryPath, details = false }) {
  const lines = summaryLines(summary.projects, details);
  const closing = `Combined report: ${summaryPath}`;
  const repository = summary.repositoryPolicy;
  const all = [
    headline(summary),
    ...lines,
    ...repositoryLines(repository),
    ...acceptanceLine(summary.projects, repository),
    closing,
  ];
  return `\n${all.join('\n')}\n`;
}

export function projectHeading(project) {
  return `\n== ${project.path} (${project.preset}) ==\n`;
}
