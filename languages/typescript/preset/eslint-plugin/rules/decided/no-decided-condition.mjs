import { decideByTruthTable, needsValues } from '../../../../../../shared/logic/propositional.mjs';
import { decideSync } from '../../../../../../shared/logic/sync/decide-sync.mjs';
import { key } from '../../../../../../shared/logic/terms.mjs';
import { depthFirst } from '../../../../../../shared/traversal.mjs';
import { conditionTerm, fact, mutableNames } from './facts.mjs';
import { conditionChecks } from './statement-flow.mjs';
import { outsideFunctions } from './syntax.mjs';

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
      known.names.forEach((name) => reached.add(name));
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
  if (services?.program === null || services?.program === undefined) {
    return true;
  }
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

function sitesIn(expression) {
  return [...outsideFunctions(expression)].filter(
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
    const flow = { sourceCode, mutable: mutableNames(sourceCode), effects: new WeakMap() };
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
      const repeated = new Set();
      for (const operand of chainOperands(node)) {
        const operandKey = key(conditionTerm(operand, sourceCode));
        if (!repeated.has(operandKey)) {
          check(operand, [...facts, ...left]);
        }
        repeated.add(operandKey);
        left.push(
          fact(operand, sourceCode, {
            holds: node.operator === '&&',
            reason: `\`${sourceCode.getText(operand)}\` comes first in the same \`${node.operator}\``,
          }),
        );
      }
    }
    function analyze(statements) {
      for (const found of conditionChecks(statements, flow)) {
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
