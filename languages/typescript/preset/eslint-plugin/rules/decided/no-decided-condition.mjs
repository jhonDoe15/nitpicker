import {
  decidingFact,
  relevantFacts,
  solveFacts,
} from '../../../../../../shared/logic/sync/solve-facts.mjs';
import { key } from '../../../../../../shared/logic/terms.mjs';
import { depthFirst } from '../../../../../../shared/traversal.mjs';
import { afterEffects, conditionTerm, effectsOf, fact, mutableNames } from './facts.mjs';
import { coercionSites } from './coercions/coercion-sites.mjs';
import { conditionChecks } from './statement-flow.mjs';
import { isNarrowingTest, outsideFunctions } from './syntax.mjs';

const CHAINS = new Set(['&&', '||']);
const VERDICTS = new Map([
  ['true', 'alwaysTrue'],
  ['false', 'alwaysFalse'],
]);

function reasonFor(facts, query, verdict) {
  return (
    decidingFact(facts, query, verdict) ?? {
      reason: 'the conditions before it decide it together',
      origin: 'path',
    }
  );
}

function verdictOf(facts, condition) {
  if (facts.length === 0) {
    return undefined;
  }
  const result = solveFacts(
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
  const known = relevantFacts(facts, fact(node, sourceCode, { holds: true }).names);
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

function guardFacts(scan, guards) {
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

function checkCoercion(scan, site, facts) {
  const { sourceCode } = scan;
  const { node, operand, guards } = site;
  const known = relevantFacts(
    [...facts, ...guardFacts(scan, guards)],
    fact(operand, sourceCode, { holds: true }).names,
  );
  const query = conditionTerm(operand, sourceCode);
  const verdict = verdictOf(known, { term: query });
  if (verdict === undefined || !isNarrowed(operand, sourceCode.parserServices)) {
    return;
  }
  const { reason } = reasonFor(known, query, verdict);
  const condition = sourceCode.getText(node);
  const messageId = verdict === 'true' ? 'coercionTrue' : 'coercionFalse';
  scan.context.report({ node, messageId, data: { condition, reason } });
}

function checkedConditions(found) {
  return found.condition === undefined ? sitesIn(found.expression) : [found.condition];
}

function analyze(scan, statements) {
  for (const found of conditionChecks(statements, scan.flow)) {
    for (const condition of checkedConditions(found)) {
      checkChain(scan, condition, found.facts);
    }
    for (const site of coercionSites(found.condition ?? found.expression)) {
      checkCoercion(scan, site, found.facts);
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
      coercionTrue:
        '`{{condition}}` is always true here: {{reason}}. Use the value itself, or fix the test that was meant.',
      coercionFalse:
        '`{{condition}}` is always false here: {{reason}}. Use `false`, or fix the test that was meant.',
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
