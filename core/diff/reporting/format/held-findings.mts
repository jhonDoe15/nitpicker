import { singleLine } from './text.mjs';
import type { ReportEntry } from '../../../../shared/values/findings.mts';
import { fieldOf, textOf } from '../../../../shared/values/readers.mts';

export type HeldGroups<T> = { readonly metrics: T[]; readonly lint: T[] };

const oneLine: (value: unknown) => string = singleLine;

function worseMessageOf(finding: ReportEntry): unknown {
  return fieldOf(finding['ratchet'], 'worseMessage');
}

export function heldFindings<T extends ReportEntry>(
  unchangedFindings: readonly T[] = [],
): HeldGroups<T> {
  const held = unchangedFindings.filter((finding) => finding['heldAtBase'] !== undefined);
  return {
    metrics: held.filter((finding) => worseMessageOf(finding) !== undefined),
    lint: held.filter((finding) => worseMessageOf(finding) === undefined),
  };
}

export function heldLine(finding: ReportEntry): string {
  const { ratchet, heldAtBase } = finding;
  const base = String(heldAtBase);
  const location =
    finding['location'] === undefined ? '' : `:${String(fieldOf(finding['location'], 'line'))}`;
  const prefix = `${textOf(finding.tool)}/${textOf(finding.rule)} ${textOf(finding.path)}${location}`;
  if (worseMessageOf(finding) === undefined) {
    const value = fieldOf(ratchet, 'value');
    const counts =
      value === heldAtBase ? `${base} at base and now` : `${base} at base, ${String(value)} now`;
    return `${prefix} ${oneLine(finding.message)} (${counts}; any increase fails)`;
  }
  const heldMessage = fieldOf(ratchet, 'heldMessage');
  const note =
    heldMessage === undefined
      ? `${oneLine(finding.message)} (allowed because base was ${base}; any increase fails)`
      : textOf(heldMessage).replaceAll('{base}', base);
  return `${prefix} ${note}`;
}
