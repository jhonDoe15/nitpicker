import type TypeScript from 'typescript';
import { typescriptApi } from '../../typed/typescript-program.mts';
import { nodeChain } from '../typed/syntax.mts';
import type { EslintFinding } from '../typed/engine.mts';
import { growthAdviceFor } from '../../hints/growth-advice.mts';
import { metricGrowth } from '../../hints/eslint-routes.mts';

export type Metric = { readonly value: number; readonly label: string };

export type RatchetPlan = (
  ({ readonly kind: 'metric' } & Metric) | { readonly kind: 'count'; readonly key: string }
) & { readonly anchorHash?: string };

const ts = typescriptApi();

function metricRules(): Readonly<
  Record<string, { readonly pattern: RegExp; readonly label: string }>
> {
  return {
    'nitpicker/cognitive-complexity': {
      pattern: /cognitive complexity of (\d+);/u,
      label: 'cognitive complexity',
    },
    complexity: { pattern: /complexity of (\d+)\./u, label: 'complexity' },
    'max-lines-per-function': { pattern: /too many lines \((\d+)\)/u, label: 'line count' },
    'max-statements': { pattern: /too many statements \((\d+)\)/u, label: 'statement count' },
    'max-params': { pattern: /too many parameters \((\d+)\)/u, label: 'parameter count' },
    'max-depth': { pattern: /nested too deeply \((\d+)\)/u, label: 'block nesting' },
  };
}

export function metricOf(ruleId: string, messageText: string): Metric | undefined {
  const rule = metricRules()[ruleId];
  const amount = rule?.pattern.exec(messageText)?.[1];
  return rule === undefined || amount === undefined
    ? undefined
    : { value: Number(amount), label: rule.label };
}

function countGroupOf(
  finding: EslintFinding,
  plan: { readonly kind: string; readonly key: string },
): string {
  return JSON.stringify([finding.rule, finding.path, finding.symbol, plan.kind, plan.key]);
}

function anchorOf(
  plan: RatchetPlan,
  subject: string,
): { readonly anchor?: { readonly key: string } } {
  return plan.anchorHash === undefined
    ? {}
    : { anchor: { key: `${plan.kind}:${subject}:text:${plan.anchorHash}` } };
}

export function withRatchets(
  findings: readonly EslintFinding[],
  plans: readonly (RatchetPlan | undefined)[],
): EslintFinding[] {
  const counts = new Map<string, number>();
  const occurrences = new Map<string, number>();
  for (const [index, finding] of findings.entries()) {
    const plan = plans[index];
    if (plan?.kind === 'count') {
      counts.set(countGroupOf(finding, plan), (counts.get(countGroupOf(finding, plan)) ?? 0) + 1);
    }
  }
  return findings.map((finding, index) => {
    const plan = plans[index];
    if (plan === undefined) {
      return finding;
    }
    if (plan.kind === 'count') {
      const growth = growthAdviceFor(finding.rule);
      return {
        ...finding,
        ...anchorOf(plan, plan.key),
        ratchet: {
          key: `count:${plan.key}`,
          value: counts.get(countGroupOf(finding, plan)),
          existingCodeOnly: true,
          ...growth,
        },
      };
    }
    const group = JSON.stringify([finding.rule, finding.path, finding.symbol]);
    const occurrence = (occurrences.get(group) ?? 0) + 1;
    occurrences.set(group, occurrence);
    return {
      ...finding,
      ...anchorOf(plan, plan.label),
      ratchet: {
        key: `metric:occurrence:${String(occurrence)}`,
        value: plan.value,
        ...metricGrowth(finding, plan),
      },
    };
  });
}

export function ratchetPlan({
  metric,
  symbol,
  reportedNode,
  messageIdentity,
}: {
  readonly metric: Metric | undefined;
  readonly symbol: string | undefined;
  readonly reportedNode: TypeScript.Node;
  readonly messageIdentity: string;
}): RatchetPlan | undefined {
  if (metric !== undefined) {
    return { kind: 'metric', ...metric };
  }
  return symbol !== undefined && isInsideFunction(reportedNode)
    ? { kind: 'count', key: messageIdentity }
    : undefined;
}

function isInsideFunction(node: TypeScript.Node): boolean {
  return nodeChain(node).some(
    (current) => ts.isFunctionLike(current) && 'body' in current && current.body !== undefined,
  );
}

export function assignSemanticOccurrences(findings: readonly EslintFinding[]): EslintFinding[] {
  const occurrences = new Map<string, number>();
  return findings.map((finding) => {
    const semanticKey = JSON.stringify([
      finding.tool,
      finding.rule,
      finding.path,
      finding.symbol ?? '',
      finding.identity,
    ]);
    const occurrence = (occurrences.get(semanticKey) ?? 0) + 1;
    occurrences.set(semanticKey, occurrence);
    return {
      ...finding,
      identity: `${finding.identity}|occurrence:${String(occurrence)}`,
    };
  });
}
