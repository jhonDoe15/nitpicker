import { appendPolicyChangeSummary } from './policy-changes.mts';
import { listOf, fieldOf } from '../../../../shared/values/readers.mts';

type Emphasize = (text: string) => string;

const HEADING = 'Notices (not failing):';

export function noticeSection(notices: readonly unknown[] = []): string[] {
  return notices.length === 0
    ? []
    : ['', HEADING, ...notices.map((notice) => `  ${String(notice)}`)];
}

function appendNoticeSummary(lines: string[], notices: unknown, emphasize: Emphasize): void {
  const [, heading, ...entries] = noticeSection(listOf(notices));
  if (heading !== undefined) {
    lines.push(emphasize(heading), ...entries);
  }
}

export function appendReviewSummary(lines: string[], summary: unknown, emphasize: Emphasize): void {
  appendPolicyChangeSummary(lines, summary, emphasize);
  appendNoticeSummary(lines, fieldOf(summary, 'notices'), emphasize);
}
