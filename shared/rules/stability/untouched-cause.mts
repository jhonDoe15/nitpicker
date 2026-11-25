import {
  appendSentence,
  hasExceptionRoute,
  insertBeforeRoute,
} from '../../messages/exception-sentence.mts';
import { MESSAGES, renderMessage } from '../../policy.mts';
import { folderOf } from './graph-maps.mts';
import { byText } from '../../text-order/by-text.mts';
import { fieldOf, fieldsOf } from '../../values/readers.mts';
import type { Cause, CauseFinding } from './stability-types.mts';

const LISTED_FILES = 3;

function changedIn(folders: readonly string[], changedFiles: readonly string[]): string[] {
  const inside = new Set(folders);
  return changedFiles.filter((file) => inside.has(folderOf(file)));
}

function unitText({
  unit,
  files,
}: {
  readonly unit: string;
  readonly files: readonly string[];
}): string {
  const listed = files.slice(0, LISTED_FILES).join(', ');
  const more =
    files.length > LISTED_FILES ? ` and ${String(files.length - LISTED_FILES)} more` : '';
  return `${unit} (${listed}${more})`;
}

function causeText(cause: Cause, changedFiles: readonly string[]): string {
  const moved = cause.units
    .map(({ unit, folders }) => ({ unit, files: changedIn(folders, changedFiles) }))
    .filter(({ files }) => files.length > 0);
  return moved.length === 0
    ? MESSAGES.stabilityMovedElsewhere
    : renderMessage(MESSAGES.stabilityMovedBy, { units: moved.map(unitText).join(', ') });
}

function withCauseText<Finding extends CauseFinding>(
  finding: Finding,
  cause: Cause,
  changedFiles: readonly string[],
): Finding {
  const text = causeText(cause, changedFiles);
  const message = hasExceptionRoute(finding.message)
    ? insertBeforeRoute(finding.message, text)
    : appendSentence(finding.message, text);
  return { ...finding, message };
}

export function withUntouchedCause<Finding extends CauseFinding>(
  findings: readonly Finding[],
  touchedCode: { readonly changedLines: ReadonlyMap<string, unknown> } | undefined,
): Finding[] {
  if (touchedCode === undefined) {
    return [...findings];
  }
  const changedFiles = [...touchedCode.changedLines.keys()].sort(byText);
  return findings.map((finding) =>
    finding.cause === undefined || changedIn(finding.cause.folders, changedFiles).length > 0
      ? finding
      : withCauseText(finding, finding.cause, changedFiles),
  );
}

function withoutCause(finding: unknown): unknown {
  return fieldOf(finding, 'cause') === undefined
    ? finding
    : Object.fromEntries(Object.entries(fieldsOf(finding)).filter(([key]) => key !== 'cause'));
}

export function withoutCauses(
  result: Readonly<Record<string, readonly unknown[]>>,
): Record<string, unknown[]> {
  return Object.fromEntries(
    Object.entries(result).map(([key, findings]) => [key, findings.map(withoutCause)]),
  );
}
