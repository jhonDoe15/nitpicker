import { RULES } from '../../../../shared/policy.mjs';
import { exceptionHint } from '../../../../shared/rules/exceptions.mjs';
import { singleLine } from '../format/text.mjs';

const LISTED_NOTES = 10;
const ACCEPT_LINE =
  '  To accept a note, add its rule and path to "exceptions" in nitpicker.config.json.';
const REPORT_ONLY_RULES = new Set(
  RULES.filter(({ reportOnly }) => reportOnly === true).map(({ id }) => id),
);

export function newDesignNotes(newFindings = []) {
  return newFindings.filter(
    ({ classification, rule }) => classification === 'descriptive' && REPORT_ONLY_RULES.has(rule),
  );
}

function withoutHint({ message, rule, path }) {
  const hint = ` ${exceptionHint(rule, path)}`;
  return message.endsWith(hint) ? message.slice(0, -hint.length) : message;
}

export function designNoteLines(notes) {
  if (notes.length === 0) {
    return [];
  }
  const listed = notes.slice(0, LISTED_NOTES).flatMap((finding) => {
    const location = finding.location === undefined ? '' : `:${String(finding.location.line)}`;
    return [
      `  ${finding.tool}/${finding.rule} ${finding.path}${location}`,
      `    ${singleLine(withoutHint(finding))}`,
    ];
  });
  const rest = notes.length - LISTED_NOTES;
  return [
    ...listed,
    ...(rest > 0 ? [`  and ${String(rest)} more in the full diagnostics`] : []),
    ACCEPT_LINE,
  ];
}

export function designNotesHeading(count) {
  const noun = count === 1 ? 'note' : 'notes';
  return `Design ${noun} for review (not failing): ${String(count)} new`;
}
