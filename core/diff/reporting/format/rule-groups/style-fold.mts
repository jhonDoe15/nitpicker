import { isStyleFinding } from './finding-order.mts';
import type { ReportEntry } from '../../../../../shared/values/findings.mts';
import { textOf } from '../../../../../shared/values/readers.mts';

export type StyleFold = {
  readonly shown: readonly ReportEntry[];
  readonly lines: readonly string[];
};

const FOLD_HINT = 'folded (list them with --label style or --details)';

function plural(count: number, noun: string): string {
  return `${String(count)} ${noun}${count === 1 ? '' : 's'}`;
}

export function foldStyle(findings: readonly ReportEntry[]): StyleFold {
  const style = findings.filter(isStyleFinding);
  if (style.length === 0 || style.length === findings.length) {
    return { shown: findings, lines: [] };
  }
  const rules = new Set(style.map(({ tool, rule }) => `${textOf(tool)}/${textOf(rule)}`));
  return {
    shown: findings.filter((finding) => !isStyleFinding(finding)),
    lines: [
      `  style: ${plural(style.length, 'finding')} from ${plural(rules.size, 'rule')}, ${FOLD_HINT}`,
    ],
  };
}
