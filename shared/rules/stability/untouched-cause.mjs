import {
  appendSentence,
  hasExceptionRoute,
  insertBeforeRoute,
} from '../../messages/exception-sentence.mjs';
import { STABILITY_FIX } from './stability-direction.mjs';

const LISTED_FILES = 3;

function changedUnits(contributors, changedLines) {
  const units = new Map();
  for (const { file, unit } of contributors.filter((entry) => changedLines.has(entry.file))) {
    units.set(unit, [...(units.get(unit) ?? []), file]);
  }
  return [...units];
}

function unitText([unit, files]) {
  const listed = files.slice(0, LISTED_FILES).join(', ');
  const more =
    files.length > LISTED_FILES ? ` and ${String(files.length - LISTED_FILES)} more` : '';
  return `${unit} (${listed}${more})`;
}

function causeText(cause, changedLines) {
  const units = changedUnits(cause.contributors, changedLines);
  return units.length === 0
    ? 'The change edited none of its files or of the files that depend on them.'
    : `The change edited none of its files: it moved the numbers through ${units.map(unitText).join(', ')}.`;
}

function isUntouched(finding, changedLines) {
  return finding.cause !== undefined && !finding.cause.files.some((file) => changedLines.has(file));
}

export function withUntouchedCause(findings, touchedCode) {
  if (touchedCode === undefined) {
    return findings;
  }
  const { changedLines } = touchedCode;
  return findings.map((finding) => {
    if (!isUntouched(finding, changedLines)) {
      return finding;
    }
    const fix = finding.message.includes(STABILITY_FIX) ? '' : ` ${STABILITY_FIX}`;
    const text = `${causeText(finding.cause, changedLines)}${fix}`;
    const message = hasExceptionRoute(finding.message)
      ? insertBeforeRoute(finding.message, text)
      : appendSentence(finding.message, text);
    return { ...finding, message };
  });
}
