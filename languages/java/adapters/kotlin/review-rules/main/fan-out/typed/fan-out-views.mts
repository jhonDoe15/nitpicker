import {
  type OccurrenceCounter,
  hash,
} from '../../../../../../../../shared/rules/finding-parts.mts';
import type { SpringView } from '../../../spring/typed/spring-shapes.mts';
import type { FanOutReport } from './fan-out-types.mts';

const hashOf: (text: string) => string = hash;

type ReportInput = {
  rule: string;
  subject: string;
  nextOccurrence: OccurrenceCounter;
  message: string;
  line: number;
  lines: number[];
};

export function fanOutReport(
  view: SpringView,
  { rule, subject, nextOccurrence, message, line, lines }: ReportInput,
): FanOutReport {
  const occurrence = nextOccurrence(`${rule}\0${subject}`);
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
