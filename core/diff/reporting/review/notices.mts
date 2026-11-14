import { policyChangeSummaryLines } from './policy-changes.mts';
import { listOf, fieldOf } from '../../../../shared/values/readers.mts';

type Emphasize = (text: string) => string;

const HEADING = 'Notices (not failing):';

export function noticeSection(notices: readonly unknown[] = []): string[] {
  return notices.length === 0
    ? []
    : ['', HEADING, ...notices.map((notice) => `  ${String(notice)}`)];
}

function noticeSummaryLines(notices: unknown, emphasize: Emphasize): string[] {
  const [, heading, ...entries] = noticeSection(listOf(notices));
  return heading === undefined ? [] : [emphasize(heading), ...entries];
}

export function reviewSummaryLines(summary: unknown, emphasize: Emphasize): string[] {
  return [
    ...policyChangeSummaryLines(summary, emphasize),
    ...noticeSummaryLines(fieldOf(summary, 'notices'), emphasize),
  ];
}
