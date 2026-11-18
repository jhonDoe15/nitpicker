import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { decidingFact as untypedDecidingFact } from '../../../../../../../shared/logic/sync/solve-facts.mjs';
import { term, type Term } from '../../analysis/logic/term-views.mts';
import { toTerm } from '../../analysis/logic/estree-terms.mts';
import { chainOf, type SourceCode } from '../../typed/node-views.mts';
import type { FlowContext } from '../effects.mts';
import { factOfTerm, relevantFacts, solveFacts, type Fact } from '../facts.mts';
import { appendAll } from '../../../../../../../shared/lists/lists.mts';

type Statement = TSESTree.Statement;
type Expression = TSESTree.Expression;
type Verdict = 'true' | 'false';
type Group = {
  readonly cases: TSESTree.SwitchCase[];
  last: TSESTree.SwitchCase;
  readonly fallsIn: boolean;
};
type Arms = {
  readonly node: TSESTree.SwitchStatement;
  readonly sourceCode: SourceCode;
  readonly earlier: readonly Expression[];
};
type Arm = { readonly statements: readonly Statement[]; readonly facts: readonly Fact[] };
type LabelSite = { readonly node: TSESTree.SwitchStatement; readonly label: Expression };
export type LabelCheck = { readonly label: LabelSite; readonly facts: readonly Fact[] };
type LabelScan = {
  readonly sourceCode: SourceCode;
  readonly context: {
    report(descriptor: {
      readonly node: TSESTree.Node;
      readonly messageId: 'alwaysTrue' | 'alwaysFalse';
      readonly data: Record<string, string>;
    }): void;
  };
};

const decidingFact: (facts: readonly Fact[], query: Term, verdict: Verdict) => Fact | undefined =
  untypedDecidingFact;

const JUMP_TYPES = new Set<string>([
  AST_NODE_TYPES.ReturnStatement,
  AST_NODE_TYPES.ThrowStatement,
  AST_NODE_TYPES.BreakStatement,
  AST_NODE_TYPES.ContinueStatement,
]);

function isLiteralLabel(node: TSESTree.Node): boolean {
  if (node.type === AST_NODE_TYPES.UnaryExpression) {
    const { argument } = node;
    return (
      node.operator === '-' &&
      argument.type === AST_NODE_TYPES.Literal &&
      typeof argument.value === 'number'
    );
  }
  return node.type === AST_NODE_TYPES.Literal && !('regex' in node);
}

function isPlainMember(node: TSESTree.Node): node is TSESTree.MemberExpression {
  return node.type === AST_NODE_TYPES.MemberExpression && !node.computed && !node.optional;
}

function isSimpleSubject(node: TSESTree.Node): boolean {
  const root = chainOf<TSESTree.Node>(node, (current) =>
    isPlainMember(current) ? current.object : undefined,
  ).at(-1);
  return root?.type === AST_NODE_TYPES.Identifier || root?.type === AST_NODE_TYPES.ThisExpression;
}

function endsInJump(consequent: readonly Statement[]): boolean {
  const blocks = chainOf<Statement>(consequent.at(-1), (current) =>
    current.type === AST_NODE_TYPES.BlockStatement ? current.body.at(-1) : undefined,
  );
  const last = blocks.at(-1);
  return last !== undefined && JUMP_TYPES.has(last.type);
}

function groupsOf(cases: readonly TSESTree.SwitchCase[]): Group[] {
  const groups: Group[] = [];
  for (const switchCase of cases) {
    const previous = groups.at(-1);
    const fallsIn = previous !== undefined && !endsInJump(previous.last.consequent);
    if (previous !== undefined && fallsIn && previous.last.consequent.length === 0) {
      previous.cases.push(switchCase);
      previous.last = switchCase;
    } else {
      groups.push({ cases: [switchCase], last: switchCase, fallsIn });
    }
  }
  return groups;
}

function equality(subject: TSESTree.Node, label: TSESTree.Node, sourceCode: SourceCode): Term {
  return term('binary', '===', [toTerm(subject, sourceCode), toTerm(label, sourceCode)]);
}

function labelsOf(group: Group): Expression[] {
  const labels = group.cases.flatMap(({ test }) =>
    test !== null && isLiteralLabel(test) ? [test] : [],
  );
  return labels.length === group.cases.length ? labels : [];
}

function excluded({ node, sourceCode }: Arms, label: Expression): Fact {
  const line = String(node.loc.start.line);
  return factOfTerm(equality(node.discriminant, label, sourceCode), {
    holds: false,
    reason: `it is not \`case ${sourceCode.getText(label)}\` of the \`switch\` on line ${line}`,
  });
}

function takingFacts(group: Group, arms: Arms): Fact[] {
  if (group.fallsIn) {
    return [];
  }
  if (group.cases.some(({ test }) => test === null)) {
    return group.cases.length > 1 ? [] : arms.earlier.map((label) => excluded(arms, label));
  }
  const labels = labelsOf(group);
  if (labels.length === 0) {
    return [];
  }
  const { node, sourceCode } = arms;
  const joined = labels
    .map((label) => equality(node.discriminant, label, sourceCode))
    .reduce((left, right) => term('logical', '||', [left, right]));
  const text = labels.map((label) => sourceCode.getText(label)).join(', ');
  const line = String(node.loc.start.line);
  return [
    factOfTerm(joined, {
      holds: true,
      reason: `it is in the \`case ${text}\` arm of the \`switch\` on line ${line}`,
    }),
  ];
}

/**
 * The statement lists of the cases of a `switch` over a plain variable or member, each with what
 * its entry tells (`subject === label`; for `default`, `subject !== label` of every earlier case; a
 * case a non-empty case falls into gets nothing), and the label checks for dead cases.
 */
export function switchFlow(
  node: TSESTree.SwitchStatement,
  facts: readonly Fact[],
  context: FlowContext,
): { readonly children: Arm[]; readonly checks: LabelCheck[] } | undefined {
  if (!isSimpleSubject(node.discriminant)) {
    return undefined;
  }
  const { sourceCode } = context;
  const children: Arm[] = [];
  const checks: LabelCheck[] = [];
  const earlier: Expression[] = [];
  for (const group of groupsOf(node.cases)) {
    const arms = { node, sourceCode, earlier };
    const own = labelsOf(group);
    const before = earlier.map((label) => excluded(arms, label));
    children.push({
      statements: group.last.consequent,
      facts: [...facts, ...takingFacts(group, arms)],
    });
    appendAll(
      checks,
      own.map((label) => ({ label: { node, label }, facts: [...facts, ...before] })),
    );
    appendAll(earlier, own);
  }
  return { children, checks };
}

/** Reports a `case` label that the facts before the `switch` decide. */
export function checkLabel(
  scan: LabelScan,
  { node, label }: LabelSite,
  facts: readonly Fact[],
): void {
  const { sourceCode } = scan;
  const query = equality(node.discriminant, label, sourceCode);
  const known = relevantFacts(facts, factOfTerm(query, { holds: true }).names);
  const verdict =
    known.length === 0
      ? undefined
      : solveFacts(
          known.map((one) => one.term),
          query,
        );
  if (verdict !== 'true' && verdict !== 'false') {
    return;
  }
  const reason =
    decidingFact(known, query, verdict)?.reason ?? 'the conditions before it decide it together';
  const condition = `${sourceCode.getText(node.discriminant)} === ${sourceCode.getText(label)}`;
  scan.context.report({
    node: label,
    messageId: verdict === 'true' ? 'alwaysTrue' : 'alwaysFalse',
    data: { condition, reason },
  });
}
