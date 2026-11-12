import { printable } from './text.mjs';

const MAX_CONSOLE_NOTES = 10;
const SENTENCE_END = /[.!?](?=\s|$)/gu;
const ABBREVIATION = /\b(?:e\.g|i\.e)\.$/iu;

export function designNoteLines(findings, diagnosticsPath, { snapshot = false } = {}) {
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

function designNoteLine(finding) {
  const location = finding.location === undefined ? '' : `:${String(finding.location.line)}`;
  const metric =
    finding.metric === undefined ? '' : ` (${finding.metric.name} ${String(finding.metric.value)})`;
  const sentence = firstSentence(printable(finding.message));
  return `  ${finding.tool}/${finding.rule} ${finding.path}${location} ${sentence}${metric}`;
}

function firstSentence(text) {
  for (const match of text.matchAll(SENTENCE_END)) {
    const sentence = text.slice(0, match.index + 1);
    if (!ABBREVIATION.test(sentence)) {
      return sentence;
    }
  }
  return text;
}
