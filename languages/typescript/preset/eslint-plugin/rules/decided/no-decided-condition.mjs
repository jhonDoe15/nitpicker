import {
  decidingFact,
  relevantFacts,
  solveFacts,
} from '../../../../../../shared/logic/sync/solve-facts.mjs';
import { key } from '../../../../../../shared/logic/terms.mjs';
import { depthFirst } from '../../../../../../shared/traversal.mjs';
import { afterEffects, conditionTerm, effectsOf, fact, mutableNames } from './facts.mjs';
import { recordCaptures } from './flow/closures.mjs';
import { sitesIn } from './flow/sites.mjs';
import { checkLabel } from './flow/switch.mjs';
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

function sitesOf(scan, found) {
  return found.condition === undefined
    ? sitesIn(found.expression, scan)
    : [{ node: found.condition, extra: [] }];
}

function analyze(scan, statements, initial = []) {
  for (const found of conditionChecks(statements, scan.flow)) {
    if (found.label !== undefined) {
      checkLabel(scan, found.label, [...initial, ...found.facts]);
      continue;
    }
    for (const site of sitesOf(scan, found)) {
      checkChain(scan, site.node, [...initial, ...found.facts, ...site.extra]);
    }
  }
}

function analyzeExpression(scan, expression, facts) {
  recordCaptures([expression], facts, scan.flow);
  for (const site of sitesIn(expression, scan)) {
    checkChain(scan, site.node, [...facts, ...site.extra]);
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
    const flow = {
      sourceCode,
      mutable: mutableNames(sourceCode),
      effects: new WeakMap(),
      captured: new Map(),
    };
    const scan = { context, sourceCode, flow };
    function analyzeFunction(node) {
      const facts = flow.captured.get(node) ?? [];
      if (node.body.type === 'BlockStatement') {
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
