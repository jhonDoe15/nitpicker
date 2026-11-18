import { afterEffects, effectsOf, fact } from './facts.mjs';
import { exitOf, statementsOf, textOf } from './flow/exits.mjs';
import { loopEntry } from './flow/loops.mjs';
import { nestedFlow } from './flow/nested.mjs';
import { statementFacts } from './flow/values/statement-facts.mjs';
import { appendAll } from '../../lists/items.mjs';

const LOOPS = new Set(['for', 'foreach', 'while', 'do']);

function guardFact(test, scope, { holds, exit }) {
  const line = String(test.start);
  const text = textOf(test);
  const reason =
    exit === undefined
      ? `it is inside the ${holds ? '' : '`else` of the '}\`if (${text})\` on line ${line}`
      : `line ${line} ${exit} when \`${text}\` is ${holds ? 'false' : 'true'}`;
  const known = fact(test, scope, { holds, reason });
  return known === undefined ? [] : [known];
}

function guardFacts(node, flow, { holds, exit, branch }) {
  const guard = guardFact(node.children[0], flow.scope, { holds, exit });
  const afterTest = afterEffects(guard, effectsOf([node.children[0]], flow), flow.mutable);
  return afterEffects(afterTest, effectsOf([branch], flow), flow.mutable);
}

function afterIf(node, atTest, flow) {
  const [, then, otherwise] = node.children;
  const [thenExit, otherExit] = [
    exitOf(then),
    otherwise.kind === 'none' ? undefined : exitOf(otherwise),
  ];
  const effects = [effectsOf([then], flow), effectsOf([otherwise], flow)];
  if (thenExit !== undefined && otherExit === undefined) {
    return [
      ...afterEffects(atTest, effects[1], flow.mutable),
      ...guardFacts(node, flow, { holds: false, exit: thenExit, branch: otherwise }),
    ];
  }
  if (otherExit !== undefined && thenExit === undefined) {
    return [
      ...afterEffects(atTest, effects[0], flow.mutable),
      ...guardFacts(node, flow, { holds: true, exit: otherExit, branch: then }),
    ];
  }
  return thenExit === undefined
    ? afterEffects(afterEffects(atTest, effects[0], flow.mutable), effects[1], flow.mutable)
    : [];
}

function ifFlow(node, facts, flow) {
  const [test, then, otherwise] = node.children;
  const atTest = afterEffects(facts, effectsOf([test], flow), flow.mutable);
  const children = [
    {
      statements: statementsOf(then),
      facts: [...atTest, ...guardFacts(node, flow, { holds: true })],
    },
    {
      statements: statementsOf(otherwise),
      facts: [...atTest, ...guardFacts(node, flow, { holds: false })],
    },
  ];
  return {
    checks: [{ condition: test, facts: atTest }],
    children,
    after: afterIf(node, atTest, flow),
  };
}

function loopFlow(node, facts, flow) {
  const inLoop = afterEffects(facts, effectsOf([node], flow), flow.mutable);
  const body = node.kind === 'do' ? node.children[0] : node.children.at(-1);
  const { test, facts: entry } = loopEntry(node, flow);
  return {
    checks: test === undefined ? [] : [{ condition: test, facts: inLoop }],
    children: [{ statements: statementsOf(body), facts: [...inLoop, ...entry] }],
    after: inLoop,
  };
}

function otherFlow(node, facts, flow) {
  const after = afterEffects(facts, effectsOf([node], flow), flow.mutable);
  if (node.kind === 'block') {
    return { checks: [], children: [{ statements: node.children, facts }], after };
  }
  const nested = nestedFlow(node, { before: facts, after }, flow);
  return {
    checks: [{ expression: node, facts: after }, ...nested.checks],
    children: nested.children,
    after: [...after, ...statementFacts(node, flow)],
  };
}

function statementFlow(node, facts, flow) {
  if (node.kind === 'if') {
    return ifFlow(node, facts, flow);
  }
  return LOOPS.has(node.kind) ? loopFlow(node, facts, flow) : otherFlow(node, facts, flow);
}

function declaredNames(statements) {
  return statements
    .filter((statement) => statement.kind === 'declare')
    .map((statement) => statement.children[1]?.value);
}

function shadowed(facts, statements) {
  const declared = new Set(declaredNames(statements));
  return facts.filter((known) => ![...known.names].some((name) => declared.has(name)));
}

/**
 * Walks the statements of one function body and returns every condition check with the facts
 * known to hold there: `{ condition }` for an `if` or `while` test, `{ expression }` for the
 * conditions nested in a statement's own expressions.
 */
export function conditionChecks(body, flow) {
  const pending = [{ statements: body, facts: [] }];
  const checks = [];
  for (const task of pending) {
    let facts = shadowed(task.facts, task.statements);
    for (const statement of task.statements) {
      const next = statementFlow(statement, facts, flow);
      appendAll(checks, next.checks);
      appendAll(
        pending,
        next.children.filter(({ statements }) => statements.length > 0),
      );
      facts = next.after;
    }
  }
  return checks;
}
