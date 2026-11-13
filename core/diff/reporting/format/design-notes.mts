import { printable } from './text.mjs';
import type { ReportEntry } from '../../../../shared/values/findings.mts';
import { fieldOf, textOf } from '../../../../shared/values/readers.mts';

const printed: (value: unknown) => string = printable;

const MAX_CONSOLE_NOTES = 10;
const SENTENCE_END = /[.!?](?=\s|$)/gu;
const ABBREVIATION = /\b(?:e\.g|i\.e)\.$/iu;

export function designNoteLines(
  findings: readonly ReportEntry[],
  diagnosticsPath: string,
  { snapshot }: { readonly snapshot: boolean },
): string[] {
  const descriptive = findings.filter(({ classification }) => classification === 'descriptive');
  if (descriptive.length === 0) {
    return [];
  }
  const notes = [
    ...descriptive.filter(({ metric }) => metric === undefined),
    ...descriptive.filter(({ metric }) => metric !== undefined),
  ];
  const noun = notes.length === 1 ? 'note' : 'notes';
  const scope = snapshot ? 'in the snapshot' : 'new';
  const lines = [
    `Design ${noun} for review (not failing): ${String(notes.length)} ${scope}`,
    ...notes.slice(0, MAX_CONSOLE_NOTES).map(designNoteLine),
  ];
  if (notes.length > MAX_CONSOLE_NOTES) {
    lines.push(`  … ${String(notes.length - MAX_CONSOLE_NOTES)} more; see ${diagnosticsPath}`);
  }
  return lines;
}

function designNoteLine(finding: ReportEntry): string {
  const location =
    finding['location'] === undefined ? '' : `:${String(fieldOf(finding['location'], 'line'))}`;
  const { metric } = finding;
  const metricText =
    metric === undefined
      ? ''
      : ` (${textOf(fieldOf(metric, 'name'))} ${String(fieldOf(metric, 'value'))})`;
  const sentence = firstSentence(printed(finding.message));
  return `  ${textOf(finding.tool)}/${textOf(finding.rule)} ${textOf(finding.path)}${location} ${sentence}${metricText}`;
}

function firstSentence(text: string): string {
  for (const match of text.matchAll(SENTENCE_END)) {
    const sentence = text.slice(0, match.index + 1);
    if (!ABBREVIATION.test(sentence)) {
      return sentence;
    }
  }
  return text;
}
