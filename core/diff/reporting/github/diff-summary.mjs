import {
  LISTED_NOTES,
  cappedList,
  code,
  exceptionExample,
  exceptionRoute,
  findingList,
  inlineText,
  pluralize,
  ruleTable,
  toolErrorList,
} from './markdown.mjs';

function headline(report) {
  if (report.summary.noChanges === true && report.toolErrors.length === 0) {
    return '✓ No changes since the merge base; nothing to check';
  }
  const enforceable = report.newFindings.filter(
    ({ classification }) => classification === 'enforceable',
  );
  if (enforceable.length > 0) {
    return `✖ ${pluralize(enforceable.length, 'new enforceable finding')}`;
  }
  return report.toolErrors.length > 0
    ? '✖ Incomplete: no new enforceable findings, but a tool failed'
    : '✓ No new enforceable findings';
}

const SHORT_SHA_LENGTH = 12;

function shortSha(sha) {
  return String(sha).slice(0, SHORT_SHA_LENGTH);
}

function comparisonLine(report) {
  const { summary } = report;
  const base = `Base ${code(summary.requestedBaseRef)} (merge base ${code(shortSha(summary.mergeBaseSha))})`;
  const metrics = pluralize(report.changedMetrics.length, 'changed metric');
  const counts = [
    pluralize(report.newFindings.length, 'new finding'),
    `${String(report.resolvedFindings.length)} resolved`,
    metrics,
  ];
  return [`${base}, head ${code(shortSha(summary.headSha))}.`, `${counts.join(', ')}.`];
}

function policySection(summary) {
  const changes = summary.policyChanges ?? [];
  if (changes.length === 0) {
    return [];
  }
  const accepted = summary.policyChangeAccepted === true;
  return [
    `### Policy changed in this change${accepted ? ' (loosening accepted)' : ''}`,
    '',
    ...cappedList(changes, inlineText, LISTED_NOTES),
  ];
}

function noticeSection(summary) {
  const notices = summary.notices ?? [];
  if (notices.length === 0) {
    return [];
  }
  return ['### Notices (not failing)', '', ...cappedList(notices, inlineText, LISTED_NOTES)];
}

function heldLine(report) {
  const held = report.unchangedFindings.filter((finding) => finding.heldAtBase !== undefined);
  if (held.length === 0) {
    return [];
  }
  const verb = held.length === 1 ? 'is' : 'are';
  return [
    `${pluralize(held.length, 'finding')} in touched code ${verb} still over a limit or lint rule`,
    'but no worse than at the base (not failing; listed in `report.txt`).',
    '',
  ];
}

function pendingLoosening(summary) {
  const loosened = (summary.policyLoosenings ?? []).length > 0;
  return loosened && summary.policyChangeAccepted !== true ? summary.policyDigest : undefined;
}

export function renderDiffSummary(report, context) {
  const enforceable = report.newFindings.filter(
    ({ classification }) => classification === 'enforceable',
  );
  return [
    `## nitpicker${context.projectPrefix === '' ? '' : ` ${code(context.projectPrefix)}`}`,
    '',
    `**${headline(report)}**`,
    '',
    ...comparisonLine(report),
    '',
    ...policySection(report.summary),
    ...(report.newFindings.length === 0
      ? []
      : ['### New findings by tool and rule', '', ...ruleTable(report.newFindings)]),
    ...findingList(enforceable, context, `New enforceable findings`),
    ...toolErrorList(report.toolErrors),
    ...noticeSection(report.summary),
    ...heldLine(report),
    ...exceptionRoute({
      hasFindings: enforceable.length > 0,
      example: exceptionExample(enforceable),
      loosening: pendingLoosening(report.summary),
    }),
  ].join('\n');
}
