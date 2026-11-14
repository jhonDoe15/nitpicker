import { singleLine } from './text.mjs';
import { withoutRoute } from './rule-groups/rule-groups.mts';
import { ANSI, pluralize, style } from '../console/style.mts';
import type { ReportEntry } from '../../../../shared/values/findings.mts';
import { fieldOf, textOf } from '../../../../shared/values/readers.mts';

export type HeldGroups<T> = { readonly metrics: T[]; readonly lint: T[] };

type HeldOptions = {
  readonly color: boolean;
  readonly details: boolean;
  readonly diagnosticsPath: string;
};

const oneLine: (value: unknown) => string = singleLine;
const styled: (value: string, codes: readonly string[], color: boolean) => string = style;
const plural: (noun: string, count: number) => string = pluralize;

const MAX_HELD_LINES = 10;
const FINDING = 'finding';

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

function heldList(
  findings: readonly ReportEntry[],
  { details, diagnosticsPath }: Omit<HeldOptions, 'color'>,
): string[] {
  const shown = details ? findings : findings.slice(0, MAX_HELD_LINES);
  const rest = findings.length - shown.length;
  return [
    ...shown.map((finding) => `  ${heldLine(details ? finding : withoutRoute(finding))}`),
    ...(rest === 0 ? [] : [`  … ${String(rest)} more; see ${diagnosticsPath}`]),
  ];
}

function dimmed(text: string, color: boolean): string {
  return styled(text, [ANSI.dim], color);
}

export function heldSummaryLines(
  unchangedFindings: readonly ReportEntry[],
  { color, details, diagnosticsPath }: HeldOptions,
): string[] {
  const { metrics, lint } = heldFindings(unchangedFindings);
  return [
    ...(metrics.length === 0
      ? []
      : [
          dimmed(
            `Note: ${String(metrics.length)} ${plural(FINDING, metrics.length)} still over a limit in touched code (not failing, not worse than before):`,
            color,
          ),
          ...heldList(metrics, { details, diagnosticsPath }),
        ]),
    ...(lint.length === 0
      ? []
      : [
          dimmed(
            `Note: ${String(lint.length)} existing lint ${plural(FINDING, lint.length)} in edited code (not failing, no more than before):`,
            color,
          ),
          ...heldList(lint, { details, diagnosticsPath }),
        ]),
  ];
}
