import {
  appendSentence,
  hasExceptionRoute,
  insertBeforeRoute,
} from '../../messages/exception-sentence.mjs';
import { MESSAGES, renderMessage } from '../../policy.mjs';
import { folderOf } from './graph-maps.mjs';

const LISTED_FILES = 3;

function changedIn(folders, changedFiles) {
  const inside = new Set(folders);
  return changedFiles.filter((file) => inside.has(folderOf(file)));
}

function unitText({ unit, files }) {
  const listed = files.slice(0, LISTED_FILES).join(', ');
  const more =
    files.length > LISTED_FILES ? ` and ${String(files.length - LISTED_FILES)} more` : '';
  return `${unit} (${listed}${more})`;
}

function causeText(cause, changedFiles) {
  const moved = cause.units
    .map(({ unit, folders }) => ({ unit, files: changedIn(folders, changedFiles) }))
    .filter(({ files }) => files.length > 0);
  return moved.length === 0
    ? MESSAGES.stabilityMovedElsewhere
    : renderMessage(MESSAGES.stabilityMovedBy, { units: moved.map(unitText).join(', ') });
}

function withCauseText(finding, changedFiles) {
  const text = causeText(finding.cause, changedFiles);
  const message = hasExceptionRoute(finding.message)
    ? insertBeforeRoute(finding.message, text)
    : appendSentence(finding.message, text);
  return { ...finding, message };
}

export function withUntouchedCause(findings, touchedCode) {
  if (touchedCode === undefined) {
    return findings;
  }
  const changedFiles = [...touchedCode.changedLines.keys()].sort();
  return findings.map((finding) =>
    finding.cause === undefined || changedIn(finding.cause.folders, changedFiles).length > 0
      ? finding
      : withCauseText(finding, changedFiles),
  );
}

function withoutCause(finding) {
  return finding.cause === undefined
    ? finding
    : Object.fromEntries(Object.entries(finding).filter(([key]) => key !== 'cause'));
}

export function withoutCauses(result) {
  return Object.fromEntries(
    Object.entries(result).map(([key, findings]) => [key, findings.map(withoutCause)]),
  );
}
