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
import { helperNote as untypedHelperNote } from '../../../../../../shared/logic/models/helper-note.mjs';
import { hasModels as untypedHasModels } from '../../../../../../shared/logic/models/models.mjs';
import { key as untypedKey } from '../../../../../../shared/logic/terms.mjs';
import { depthFirst, type SourceCode } from '../typed/node-views.mts';
import type { Term } from '../analysis/logic/estree-terms.mts';
import { afterEffects, effectsOf, mutableNames, type FlowContext } from './effects.mts';
import { conditionTerm, fact, typedServices, type Fact } from './facts.mts';
import { coercionSites, type CoercionSite, type Guard } from './coercions/coercion-sites.mts';
import { recordCaptures } from './flow/closures.mts';
import { sitesIn } from './flow/sites.mts';
import { checkLabel } from './flow/switch.mts';
import { conditionChecks, type StatementCheck } from './statement-flow.mts';
import { isNarrowingTest, outsideFunctions } from './syntax.mts';

type MessageId = 'alwaysTrue' | 'alwaysFalse' | 'coercionTrue' | 'coercionFalse';
type Verdict = 'true' | 'false';
type Scan = {
  readonly context: Readonly<TSESLint.RuleContext<MessageId, readonly []>>;
  readonly sourceCode: SourceCode;
  readonly services: ParserServicesWithTypeInformation;
  readonly flow: FlowContext;
};
type Found = { readonly reason: string };
type Deciding = { readonly reason: string | undefined; readonly term?: Term | undefined };
type Hit = {
  readonly node: TSESTree.Node;
  readonly facts: readonly Fact[];
  readonly verdict: Verdict;
  readonly query: Term;
};
type FunctionNode =
  TSESTree.FunctionDeclaration | TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression;
type Site = { readonly node: TSESTree.Node; readonly extra: readonly Fact[] };

const decidingFact: (
  facts: readonly Fact[],
  query: Term,
  verdict: Verdict,
) => Deciding | undefined = untypedDecidingFact;
const relevantFacts: (facts: readonly Fact[], names: ReadonlySet<string>) => Fact[] =
  untypedRelevantFacts;
const solveFacts: (conditions: readonly Term[], query: Term) => string = untypedSolveFacts;
const key: (root: Term) => string = untypedKey;
const helperNote: (terms: readonly Term[]) => string = untypedHelperNote;
const hasModels: (terms: readonly Term[]) => boolean = untypedHasModels;

const VERDICTS: Readonly<Record<Verdict, MessageId>> = {
  true: 'alwaysTrue',
  false: 'alwaysFalse',
};

function reasonFor(facts: readonly Fact[], query: Term, verdict: Verdict): Found {
  const deciding = decidingFact(facts, query, verdict);
  const reason = deciding?.reason ?? 'the conditions before it decide it together';
  const terms = deciding?.term === undefined ? [query] : [query, deciding.term];
  return { reason: `${reason}${helperNote(terms)}` };
}

function verdictOf(
  facts: readonly Fact[],
  condition: { readonly term: Term },
): Verdict | undefined {
  if (facts.length === 0 && !hasModels([condition.term])) {
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

function guardFacts(scan: Scan, guards: readonly Guard[]): Fact[] {
  return guards.flatMap(({ test, holds, branch }) => {
    const text = scan.sourceCode.getText(test);
    const reason = `it is only reached when \`${text}\` is ${String(holds)}`;
    const known = fact(test, scan.sourceCode, { holds, reason });
    const written = effectsOf([branch], scan.flow);
    const isWritten =
      [...known.names].some((name) => written.writes.has(name)) ||
      (written.memberWrite && known.readsMembers);
    return isWritten ? [] : [known];
  });
}

function checkCoercion(scan: Scan, site: CoercionSite, facts: readonly Fact[]): void {
  const { sourceCode } = scan;
  const { node, operand, guards } = site;
  const known = relevantFacts(
    [...facts, ...guardFacts(scan, guards)],
    fact(operand, sourceCode, { holds: true }).names,
  );
  const query = conditionTerm(operand, sourceCode);
  const verdict = verdictOf(known, { term: query });
  if (verdict === undefined || !isNarrowed(operand, scan.services)) {
    return;
  }
  const { reason } = reasonFor(known, query, verdict);
  const condition = sourceCode.getText(node);
  const messageId = verdict === 'true' ? 'coercionTrue' : 'coercionFalse';
  scan.context.report({ node, messageId, data: { condition, reason } });
}

function sitesOf(scan: Scan, found: StatementCheck): Site[] {
  return found.condition === undefined
    ? sitesIn(found.expression, scan)
    : [{ node: found.condition, extra: [] }];
}

function analyze(
  scan: Scan,
  statements: readonly TSESTree.Statement[],
  initial: readonly Fact[] = [],
): void {
  for (const found of conditionChecks(statements, scan.flow)) {
    if (found.label !== undefined) {
      checkLabel(scan, found.label, [...initial, ...found.facts]);
      continue;
    }
    for (const site of sitesOf(scan, found)) {
      checkChain(scan, site.node, [...initial, ...found.facts, ...site.extra]);
    }
    for (const site of coercionSites(found.condition ?? found.expression)) {
      checkCoercion(scan, site, [...initial, ...found.facts]);
    }
  }
}

function analyzeExpression(scan: Scan, expression: TSESTree.Node, facts: readonly Fact[]): void {
  recordCaptures([expression], facts, scan.flow);
  for (const site of sitesIn(expression, scan)) {
    checkChain(scan, site.node, [...facts, ...site.extra]);
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
      coercionTrue:
        '`{{condition}}` is always true here: {{reason}}. Use the value itself, or fix the test that was meant.',
      coercionFalse:
        '`{{condition}}` is always false here: {{reason}}. Use `false`, or fix the test that was meant.',
    },
  },
  create(context) {
    const { sourceCode } = context;
    const services = sourceCode.parserServices;
    if (!typedServices(services)) {
      return {};
    }
    const flow: FlowContext = {
      sourceCode,
      mutable: mutableNames(sourceCode),
      effects: new WeakMap(),
      captured: new Map(),
    };
    const scan: Scan = { context, sourceCode, services, flow };
    function analyzeFunction(node: FunctionNode): void {
      const facts = flow.captured.get(node) ?? [];
      if (node.body.type === AST_NODE_TYPES.BlockStatement) {
        analyze(scan, node.body.body, facts);
      } else {
        analyzeExpression(scan, node.body, facts);
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
