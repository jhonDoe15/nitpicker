import {
  AST_NODE_TYPES,
  type ParserServicesWithTypeInformation,
  type TSESLint,
  type TSESTree,
} from '@typescript-eslint/utils';
import {
  decidingFact as untypedDecidingFact,
  relevantFacts as untypedRelevantFacts,
  solveFacts as untypedSolveFacts,
} from '../../../../../../shared/logic/sync/solve-facts.mjs';
import { key as untypedKey } from '../../../../../../shared/logic/terms.mjs';
import { depthFirst, type SourceCode } from '../typed/node-views.mts';
import type { Term } from '../analysis/logic/estree-terms.mts';
import {
  afterEffects,
  conditionTerm,
  effectsOf,
  fact,
  mutableNames,
  typedServices,
  type Fact,
  type FlowContext,
} from './facts.mts';
import { conditionChecks, type Check } from './statement-flow.mts';
import { isNarrowingTest, outsideFunctions } from './syntax.mts';

type MessageId = 'alwaysTrue' | 'alwaysFalse';
type Verdict = 'true' | 'false';
type Scan = {
  readonly context: Readonly<TSESLint.RuleContext<MessageId, readonly []>>;
  readonly sourceCode: SourceCode;
  readonly services: ParserServicesWithTypeInformation;
  readonly flow: FlowContext;
};
type Found = { readonly reason: string | undefined };
type Hit = {
  readonly node: TSESTree.Node;
  readonly facts: readonly Fact[];
  readonly verdict: Verdict;
  readonly query: Term;
};
type FunctionNode =
  TSESTree.FunctionDeclaration | TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression;

const decidingFact: (facts: readonly Fact[], query: Term, verdict: Verdict) => Fact | undefined =
  untypedDecidingFact;
const relevantFacts: (facts: readonly Fact[], names: ReadonlySet<string>) => Fact[] =
  untypedRelevantFacts;
const solveFacts: (conditions: readonly Term[], query: Term) => string = untypedSolveFacts;
const key: (root: Term) => string = untypedKey;

const CHAINS = new Set(['&&', '||']);
const VERDICTS: Readonly<Record<Verdict, MessageId>> = {
  true: 'alwaysTrue',
  false: 'alwaysFalse',
};

function reasonFor(facts: readonly Fact[], query: Term, verdict: Verdict): Found {
  return (
    decidingFact(facts, query, verdict) ?? {
      reason: 'the conditions before it decide it together',
    }
  );
}

function verdictOf(
  facts: readonly Fact[],
  condition: { readonly term: Term },
): Verdict | undefined {
  if (facts.length === 0) {
    return undefined;
  }
  const result = solveFacts(
    facts.map(({ term }) => term),
    condition.term,
  );
  return result === 'true' || result === 'false' ? result : undefined;
}

function isValueRead(node: TSESTree.Node): boolean {
  const parent = node.parent;
  if (node.type !== AST_NODE_TYPES.Identifier && node.type !== AST_NODE_TYPES.MemberExpression) {
    return false;
  }
  const isObject = parent?.type === AST_NODE_TYPES.MemberExpression && parent.object === node;
  const isProperty =
    parent?.type === AST_NODE_TYPES.MemberExpression &&
    parent.property === node &&
    !parent.computed;
  const isCallee = parent?.type === AST_NODE_TYPES.CallExpression && parent.callee === node;
  return !(isObject || isProperty || isCallee);
}

function isNarrowed(node: TSESTree.Node, services: ParserServicesWithTypeInformation): boolean {
  const reads = [...outsideFunctions(node)].filter(isValueRead);
  return reads.every((read) => !services.getTypeAtLocation(read).isUnion());
}

function chainOperands(chain: TSESTree.LogicalExpression): TSESTree.Node[] {
  return [
    ...depthFirst<TSESTree.Node>(chain, (node) =>
      node.type === AST_NODE_TYPES.LogicalExpression && node.operator === chain.operator
        ? [node.left, node.right]
        : [],
    ),
  ].filter(
    (node) => node.type !== AST_NODE_TYPES.LogicalExpression || node.operator !== chain.operator,
  );
}

function isChainHead(node: TSESTree.LogicalExpression): boolean {
  const { parent } = node;
  const continues =
    parent.type === AST_NODE_TYPES.LogicalExpression && parent.operator === node.operator;
  const isTernaryTest =
    parent.type === AST_NODE_TYPES.ConditionalExpression && parent.test === node;
  return CHAINS.has(node.operator) && !continues && !isTernaryTest;
}

function sitesIn(expression: TSESTree.Node): TSESTree.Node[] {
  return [...outsideFunctions(expression)].flatMap((node) => {
    if (node.type === AST_NODE_TYPES.ConditionalExpression) {
      return [node.test];
    }
    return node.type === AST_NODE_TYPES.LogicalExpression && isChainHead(node) ? [node] : [];
  });
}

function report(scan: Scan, { node, facts, verdict, query }: Hit): void {
  const { reason } = reasonFor(facts, query, verdict);
  const condition = scan.sourceCode.getText(node);
  scan.context.report({ node, messageId: VERDICTS[verdict], data: { condition, reason } });
}

function check(scan: Scan, node: TSESTree.Node, facts: readonly Fact[]): boolean {
  const { sourceCode } = scan;
  if (isNarrowingTest(node)) {
    return false;
  }
  const query = conditionTerm(node, sourceCode);
  const known = relevantFacts(facts, fact(node, sourceCode, { holds: true }).names);
  const verdict = verdictOf(known, { term: query });
  if (verdict === undefined || !isNarrowed(node, scan.services)) {
    return false;
  }
  report(scan, { node, facts: known, verdict, query });
  return true;
}

function operandFact(scan: Scan, chain: TSESTree.LogicalExpression, operand: TSESTree.Node): Fact {
  return fact(operand, scan.sourceCode, {
    holds: chain.operator === '&&',
    reason: `\`${scan.sourceCode.getText(operand)}\` comes first in the same \`${chain.operator}\``,
  });
}

function checkChain(scan: Scan, node: TSESTree.Node, facts: readonly Fact[]): void {
  if (check(scan, node, facts) || node.type !== AST_NODE_TYPES.LogicalExpression) {
    return;
  }
  const { flow } = scan;
  let left: Fact[] = [];
  const repeated = new Set();
  for (const operand of chainOperands(node)) {
    const operandKey = key(conditionTerm(operand, scan.sourceCode));
    if (!repeated.has(operandKey)) {
      check(scan, operand, [...facts, ...left]);
    }
    repeated.add(operandKey);
    const effects = effectsOf([operand], flow);
    left = afterEffects([...left, operandFact(scan, node, operand)], effects, flow.mutable);
  }
}

function checkedConditions(found: Check): TSESTree.Node[] {
  return found.condition === undefined ? sitesIn(found.expression) : [found.condition];
}

function analyze(scan: Scan, statements: readonly TSESTree.Statement[]): void {
  for (const found of conditionChecks(statements, scan.flow)) {
    for (const condition of checkedConditions(found)) {
      checkChain(scan, condition, found.facts);
    }
  }
}

export const rule: TSESLint.RuleModule<
  MessageId,
  readonly [],
  { readonly requiresTypeChecking: boolean }
> = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow conditions that earlier guards in the same function already decide',
      requiresTypeChecking: true,
    },
    schema: [],
    messages: {
      alwaysTrue:
        '`{{condition}}` is always true here: {{reason}}. Remove the check, or fix the condition that was meant.',
      alwaysFalse:
        '`{{condition}}` is always false here: {{reason}}, so the code it guards never runs. Remove it, or fix the condition that was meant.',
    },
  },
  create(context) {
    const { sourceCode } = context;
    const services = sourceCode.parserServices;
    if (!typedServices(services)) {
      return {};
    }
    const flow = { sourceCode, mutable: mutableNames(sourceCode), effects: new WeakMap() };
    const scan: Scan = { context, sourceCode, services, flow };
    function analyzeFunction(node: FunctionNode): void {
      if (node.body.type === AST_NODE_TYPES.BlockStatement) {
        analyze(scan, node.body.body);
      }
    }
    return {
      Program(node) {
        analyze(scan, node.body);
      },
      FunctionDeclaration: analyzeFunction,
      FunctionExpression: analyzeFunction,
      ArrowFunctionExpression: analyzeFunction,
    };
  },
};
