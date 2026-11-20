export const OUTPUT_LIMIT_VARIABLE = 'NITPICKER_ANALYZER_OUTPUT_LIMIT_BYTES';
export const OUTPUT_LIMIT_RULE = 'output-limit';
export const MAX_ANALYZER_STDOUT_BYTES = 384 * 1024 * 1024;
export const FITTED_ANALYZER_STDOUT_BYTES = 256 * 1024 * 1024;

export type CutRule = { readonly rule: string; readonly findings: number };
export type FittedFindings<T> = { readonly findings: T[]; readonly cut: CutRule[] };
type Environment = Readonly<Record<string, string | undefined>>;
type RuleGroup = { readonly rule: string; bytes: number; findings: number };

const WHOLE_NUMBER = /^[1-9]\d*$/u;
const SEPARATOR_BYTES = 1;
const BYTES_PER_MEGABYTE = 1024 * 1024;
const MAX_NAMED_RULES = 20;

export function outputLimitBytes(environment: Environment): number | undefined {
  const value = environment[OUTPUT_LIMIT_VARIABLE];
  return value !== undefined && WHOLE_NUMBER.test(value) ? Number(value) : undefined;
}

function textField(finding: unknown, key: string): string {
  const value: unknown =
    typeof finding === 'object' && finding !== null ? Reflect.get(finding, key) : undefined;
  return typeof value === 'string' ? value : '';
}

function ruleOf(finding: unknown): string {
  return `${textField(finding, 'tool')}/${textField(finding, 'rule')}`;
}

function isCuttable(finding: unknown): boolean {
  return textField(finding, 'classification') !== 'tool-error';
}

function sizeOf(finding: unknown): number {
  return Buffer.byteLength(JSON.stringify(finding)) + SEPARATOR_BYTES;
}

function largestFirst(groups: Iterable<RuleGroup>): RuleGroup[] {
  return [...groups].toSorted(
    (left, right) => right.bytes - left.bytes || left.rule.localeCompare(right.rule),
  );
}

function measured(findings: readonly unknown[]): { total: number; groups: RuleGroup[] } {
  const groups = new Map<string, RuleGroup>();
  let total = 0;
  for (const finding of findings) {
    const bytes = sizeOf(finding);
    total += bytes;
    if (isCuttable(finding)) {
      const rule = ruleOf(finding);
      const group = groups.get(rule) ?? { rule, bytes: 0, findings: 0 };
      group.bytes += bytes;
      group.findings += 1;
      groups.set(rule, group);
    }
  }
  return { total, groups: largestFirst(groups.values()) };
}

function rulesToCut(findings: readonly unknown[], availableBytes: number): RuleGroup[] {
  const { total, groups } = measured(findings);
  const cut: RuleGroup[] = [];
  let left = total;
  for (const group of groups) {
    if (left <= availableBytes) {
      break;
    }
    left -= group.bytes;
    cut.push(group);
  }
  return cut;
}

export function fitFindings<T>(findings: readonly T[], availableBytes: number): FittedFindings<T> {
  const cut = rulesToCut(findings, availableBytes);
  const dropped = new Set(cut.map(({ rule }) => rule));
  return {
    findings: findings.filter((finding) => !(isCuttable(finding) && dropped.has(ruleOf(finding)))),
    cut: cut.map(({ rule, findings: count }) => ({ rule, findings: count })),
  };
}

export function outputLimitMessage(
  analyzer: string,
  cut: readonly CutRule[],
  limitBytes: number,
): string {
  const left = cut.reduce((sum, { findings }) => sum + findings, 0);
  const named = cut
    .slice(0, MAX_NAMED_RULES)
    .map(({ rule, findings }) => `${rule} (${String(findings)})`);
  const more = cut.length - named.length;
  return (
    `The ${analyzer} analyzer found more than the ${String(Math.floor(limitBytes / BYTES_PER_MEGABYTE))} MB ` +
    `its output holds, so the ${String(left)} findings of its largest rules were left out and the rest is ` +
    `reported: ${named.join(', ')}${more > 0 ? ` and ${String(more)} more rules` : ''}. ` +
    'Exclude generated or vendored code, or gate the project in smaller parts, to see them'
  );
}
