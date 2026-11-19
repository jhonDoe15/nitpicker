import { hash, nextOccurrence } from '../../../../../../../../shared/rules/finding-helpers.mjs';
import type { SpringView } from '../../../spring/typed/spring-shapes.mts';
import type { FanOutReport } from './fan-out-types.mts';

const occurrenceOf: (occurrences: Map<string, number>, key: string) => number = nextOccurrence;

const hashOf: (text: string) => string = hash;

type ReportInput = {
  rule: string;
  subject: string;
  occurrences: Map<string, number>;
  message: string;
  line: number;
  lines: number[];
};

export function fanOutReport(
  view: SpringView,
  { rule, subject, occurrences, message, line, lines }: ReportInput,
): FanOutReport {
  const occurrence = occurrenceOf(occurrences, `${rule}\0${subject}`);
  const suffix = occurrence === 1 ? '' : `#${String(occurrence)}`;
  return {
    finding: {
      tool: 'kotlin-source',
      rule,
      path: view.file.file,
      identity: `${rule}:${hashOf(subject)}${suffix}`,
      message,
      classification: 'enforceable',
      location: { line },
    },
    lines,
  };
}
