import { decideByTruthTable, needsValues } from '../../../../../../shared/logic/propositional.mjs';
import { decideSync } from '../../../../../../shared/logic/sync/decide-sync.mjs';
import { key } from '../../../../../../shared/logic/terms.mjs';
import { depthFirst } from '../../../../../../shared/traversal.mjs';
import { afterEffects, conditionTerm, effectsOf, fact, mutableNames } from './facts.mjs';
import { conditionChecks } from './statement-flow.mjs';
import { isNarrowingTest, outsideFunctions } from './syntax.mjs';

const CHAINS = new Set(['&&', '||']);
const MAX_FACTS = 24;
const REASON_TRIES = 6;
const VERDICTS = new Map([
  ['true', 'alwaysTrue'],
  ['false', 'alwaysFalse'],
]);

function sharesName(known, reached) {
  return [...known.names].some((name) => reached.has(name));
}

function relevant(facts, names) {
  const reached = new Set(names);
  const kept = new Set();
  const rounds = [facts];
  for (const round of rounds) {
    const joined = round.filter((known) => !kept.has(known) && sharesName(known, reached));
    for (const known of joined) {
      kept.add(known);
    }
    for (const name of joined.flatMap((known) => [...known.names])) {
      reached.add(name);
    }
    if (joined.length > 0) {
      rounds.push(facts);
    }
  }
  return facts.filter((known) => kept.has(known)).slice(-MAX_FACTS);
}

function solve(conditions, query) {
  const quick = decideByTruthTable(conditions, query);
  if (quick !== 'open' && quick !== undefined) {
    return quick;
  }
  return quick === undefined || needsValues(conditions, query)
    ? decideSync(conditions, query)
    : 'open';
}

function reasonFor(facts, query, verdict) {
  const single = facts
    .toReversed()
    .slice(0, REASON_TRIES)
    .find((known) => solve([known.term], query) === verdict);
  return single ?? { reason: 'the conditions before it decide it together', origin: 'path' };
}

function verdictOf(facts, condition) {
  if (facts.length === 0) {
    return undefined;
  }
  const result = solve(
    facts.map(({ term }) => term),
    condition.term,
  );
  return VERDICTS.has(result) ? result : undefined;
}

function isValueRead(node) {
  const parent = node.parent;
  if (node.type !== 'Identifier' && node.type !== 'MemberExpression') {
    return false;
  }
  const isObject = parent?.type === 'MemberExpression' && parent.object === node;
  const isProperty =
    parent?.type === 'MemberExpression' && parent.property === node && !parent.computed;
  const isCallee = parent?.type === 'CallExpression' && parent.callee === node;
  return !isObject && !isProperty && !isCallee;
}

function isNarrowed(node, services) {
  const reads = [...outsideFunctions(node)].filter(isValueRead);
  return reads.every((read) => !services.getTypeAtLocation(read).isUnion());
}

function chainOperands(chain) {
  return [
    ...depthFirst(chain, (node) =>
      node.type === 'LogicalExpression' && node.operator === chain.operator
        ? [node.left, node.right]
        : [],
    ),
  ].filter((node) => node.type !== 'LogicalExpression' || node.operator !== chain.operator);
}

function isChainHead(node) {
  const { parent } = node;
  const continues = parent?.type === 'LogicalExpression' && parent.operator === node.operator;
  const isTernaryTest = parent?.type === 'ConditionalExpression' && parent.test === node;
  return CHAINS.has(node.operator) && !continues && !isTernaryTest;
}

function sitesIn(expression) {
  return [...outsideFunctions(expression)].flatMap((node) => {
    if (node.type === 'ConditionalExpression') {
      return [node.test];
    }
    return node.type === 'LogicalExpression' && isChainHead(node) ? [node] : [];
  });
}

function report(scan, { node, facts, verdict, query }) {
  const { reason } = reasonFor(facts, query, verdict);
  const condition = scan.sourceCode.getText(node);
  scan.context.report({ node, messageId: VERDICTS.get(verdict), data: { condition, reason } });
}

function check(scan, node, facts) {
  const { sourceCode } = scan;
  if (isNarrowingTest(node)) {
    return false;
  }
  const query = conditionTerm(node, sourceCode);
  const known = relevant(facts, fact(node, sourceCode, { holds: true }).names);
  const verdict = verdictOf(known, { term: query });
  if (verdict === undefined || !isNarrowed(node, sourceCode.parserServices)) {
    return false;
  }
  report(scan, { node, facts: known, verdict, query });
  return true;
}

function operandFact(scan, chain, operand) {
  return fact(operand, scan.sourceCode, {
    holds: chain.operator === '&&',
    reason: `\`${scan.sourceCode.getText(operand)}\` comes first in the same \`${chain.operator}\``,
  });
}

function checkChain(scan, node, facts) {
  if (check(scan, node, facts) || node.type !== 'LogicalExpression') {
    return;
  }
  const { flow } = scan;
  let left = [];
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

function checkedConditions(found) {
  return found.condition === undefined ? sitesIn(found.expression) : [found.condition];
}

function analyze(scan, statements) {
  for (const found of conditionChecks(statements, scan.flow)) {
    for (const condition of checkedConditions(found)) {
      checkChain(scan, condition, found.facts);
    }
  }
}

export const rule = {
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
    const program = sourceCode.parserServices?.program;
    if (program === null || program === undefined) {
      return {};
    }
    const flow = { sourceCode, mutable: mutableNames(sourceCode), effects: new WeakMap() };
    const scan = { context, sourceCode, flow };
    function analyzeFunction(node) {
      if (node.body.type === 'BlockStatement') {
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
