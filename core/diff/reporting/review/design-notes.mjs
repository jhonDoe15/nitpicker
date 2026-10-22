import { DESIGN_RULES } from '../../../../shared/project-rules/design-rules.mjs';
import { singleLine } from '../format/text.mjs';

const LISTED_NOTES = 10;

export function newDesignNotes(newFindings = []) {
  return newFindings.filter(
    ({ classification, rule }) => classification === 'descriptive' && DESIGN_RULES.includes(rule),
  );
}

export function designNoteLines(notes) {
  if (notes.length === 0) {
    return [];
  }
  const listed = notes.slice(0, LISTED_NOTES).flatMap((finding) => {
    const location = finding.location === undefined ? '' : `:${String(finding.location.line)}`;
    return [
      `  ${finding.tool}/${finding.rule} ${finding.path}${location}`,
      `    ${singleLine(finding.message)}`,
    ];
  });
  const rest = notes.length - LISTED_NOTES;
  return [...listed, ...(rest > 0 ? [`  and ${String(rest)} more in the full diagnostics`] : [])];
}

export function designNotesHeading(count) {
  const noun = count === 1 ? 'note' : 'notes';
  return `Design ${noun} for review (not failing): ${String(count)} new`;
}
