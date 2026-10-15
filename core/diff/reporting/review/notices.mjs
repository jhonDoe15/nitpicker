import { appendPolicyChangeSummary } from './policy-changes.mjs';

const HEADING = 'Notices (not failing):';

export function noticeSection(notices = []) {
  return notices.length === 0 ? [] : ['', HEADING, ...notices.map((notice) => `  ${notice}`)];
}

function appendNoticeSummary(lines, notices, emphasize) {
  const [, heading, ...entries] = noticeSection(notices);
  if (heading !== undefined) {
    lines.push(emphasize(heading), ...entries);
  }
}

export function appendReviewSummary(lines, summary, emphasize) {
  appendPolicyChangeSummary(lines, summary, emphasize);
  appendNoticeSummary(lines, summary?.notices, emphasize);
}
