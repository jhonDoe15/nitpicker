import { decideSync } from '../../../../../../shared/logic/sync/decide-sync.mjs';
import { depthFirst, objectChildren } from '../../../../../../shared/traversal.mjs';
import { conditionTerm, fact, mutableNames } from './facts.mjs';
import { conditionChecks } from './statement-flow.mjs';

const FUNCTIONS = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);
const CHAINS = new Set(['&&', '||']);
const MAX_FACTS = 24;
const REASON_TRIES = 6;
const VERDICTS = new Map([
  ['true', 'alwaysTrue'],
  ['false', 'alwaysFalse'],
]);

function relevant(facts, names) {
  const reached = new Set(names);
  const kept = new Set();
  for (let grown = true; grown;) {
    grown = false;
    for (const known of facts.filter((candidate) => !kept.has(candidate))) {
      if ([...known.names].some((name) => reached.has(name))) {
        kept.add(known);
        for (const name of known.names) reached.add(name);
        grown = true;
      }
    }
  }
  return facts.filter((known) => kept.has(known)).slice(-MAX_FACTS);
}

function reasonFor(facts, query, verdict) {
  const single = facts
    .toReversed()
    .slice(0, REASON_TRIES)
    .find((known) => decideSync([known.term], query) === verdict);
  return single ?? { reason: 'the conditions before it decide it together', origin: 'path' };
}

function verdictOf(facts, condition) {
  if (facts.length === 0) {
    return undefined;
  }
  const result = decideSync(
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

/**
 * Whether TypeScript sees the same: every value the condition reads has a type that is not a
 * union. A union-typed read (`boolean`, `T | undefined`, a tag union) means the check may still be
 * needed to narrow the type, even though the value is decided.
 */
function isNarrowed(node, services) {
  if (services?.program === null || services?.program === undefined) {
    return true;
  }
  const reads = [
    ...depthFirst(node, (child) => (FUNCTIONS.has(child.type) ? [] : objectChildren(child))),
  ].filter(isValueRead);
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

function sitesIn(expression) {
  return [
    ...depthFirst(expression, (node) => (FUNCTIONS.has(node.type) ? [] : objectChildren(node))),
  ].filter(
    (node) =>
      node.type === 'ConditionalExpression' ||
      (node.type === 'LogicalExpression' &&
        CHAINS.has(node.operator) &&
        !(node.parent?.type === 'LogicalExpression' && node.parent.operator === node.operator)),
  );
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
    const state = { mutable: undefined };
    function flowContext() {
      state.mutable ??= mutableNames(sourceCode);
      return { sourceCode, mutable: state.mutable };
    }
    function report(node, facts, verdict, query) {
      const { reason } = reasonFor(facts, query, verdict);
      const condition = sourceCode.getText(node);
      context.report({ node, messageId: VERDICTS.get(verdict), data: { condition, reason } });
    }
    function check(node, facts) {
      const condition = {
        term: conditionTerm(node, sourceCode),
        names: fact(node, sourceCode, { holds: true }).names,
      };
      const known = relevant(facts, condition.names);
      const verdict = verdictOf(known, condition);
      if (verdict !== undefined && isNarrowed(node, sourceCode.parserServices)) {
        report(node, known, verdict, condition.term);
        return true;
      }
      return false;
    }
    function checkChain(node, facts) {
      if (check(node, facts) || node.type !== 'LogicalExpression') {
        return;
      }
      const left = [];
      for (const operand of chainOperands(node)) {
        check(operand, [...facts, ...left]);
        left.push(
          fact(operand, sourceCode, {
            holds: node.operator === '&&',
            reason: `\`${sourceCode.getText(operand)}\` comes first in the same \`${node.operator}\``,
          }),
        );
      }
    }
    function analyze(statements) {
      for (const found of conditionChecks(statements, flowContext())) {
        if (found.condition !== undefined) {
          checkChain(found.condition, found.facts);
        } else {
          for (const site of sitesIn(found.expression)) {
            checkChain(site.type === 'ConditionalExpression' ? site.test : site, found.facts);
          }
        }
      }
    }
    function analyzeFunction(node) {
      if (node.body.type === 'BlockStatement') {
        analyze(node.body.body);
      }
    }
    return {
      Program(node) {
        analyze(node.body);
      },
      FunctionDeclaration: analyzeFunction,
      FunctionExpression: analyzeFunction,
      ArrowFunctionExpression: analyzeFunction,
    };
  },
};
