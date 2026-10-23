import { singleLine } from './text.mjs';

const MAX_CONSOLE_NOTES = 10;

export function designNoteLines(findings, diagnosticsPath) {
  const notes = findings.filter(({ classification }) => classification === 'descriptive');
  if (notes.length === 0) {
    return [];
  }
  const noun = notes.length === 1 ? 'note' : 'notes';
  const lines = [
    `Design ${noun} for review (not failing): ${String(notes.length)} new`,
    ...notes.slice(0, MAX_CONSOLE_NOTES).map(designNoteLine),
  ];
  if (notes.length > MAX_CONSOLE_NOTES) {
    lines.push(`  … ${String(notes.length - MAX_CONSOLE_NOTES)} more; see ${diagnosticsPath}`);
  }
  return lines;
}

function designNoteLine(finding) {
  const location = finding.location === undefined ? '' : `:${String(finding.location.line)}`;
  const text = singleLine(finding.message);
  const sentence = text.match(/^.*?[.!?](?:\s|$)/u)?.[0].trim() ?? text;
  return `  ${finding.tool}/${finding.rule} ${finding.path}${location} ${sentence}`;
}
