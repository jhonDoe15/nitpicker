import { afterEffects, effectsOf, fact } from './facts.mts';
import { exitOf, statementsOf, nodeText } from './flow/exits.mts';
import { walkConditionChecks } from './flow/walk.mts';
import { loopEntry } from './flow/loops.mts';
import { nestedFlow } from './flow/nested.mts';
import { statementFacts } from './flow/values/statement-facts.mts';
import { present } from '../../near-duplicates/tree/nodes.mts';
import type { Check, Effects, Fact, Flow, FlowNode, FlowStep } from './typed/decided-types.mts';

type Guard = { readonly holds: boolean; readonly exit?: string | undefined };

const LOOPS = new Set(['for', 'foreach', 'while', 'do']);

function guardFact(test: FlowNode, scope: Flow['scope'], { holds, exit }: Guard): Fact[] {
  const line = String(test.start);
  const text = nodeText(test);
  const reason =
    exit === undefined
      ? `it is inside the ${holds ? '' : '`else` of the '}\`if (${text})\` on line ${line}`
      : `line ${line} ${exit} when \`${text}\` is ${holds ? 'false' : 'true'}`;
  const known = fact(test, scope, { holds, reason });
  return known === undefined ? [] : [known];
}

function guardFacts(
  node: FlowNode,
  flow: Flow,
  { holds, exit, branch }: Guard & { readonly branch?: FlowNode | undefined },
): Fact[] {
  const guard = guardFact(present(node.children[0]), flow.scope, { holds, exit });
  const afterTest = afterEffects(guard, effectsOf([node.children[0]], flow), flow.mutable);
  return afterEffects(afterTest, effectsOf([branch], flow), flow.mutable);
}

function afterIf(node: FlowNode, atTest: readonly Fact[], flow: Flow): Fact[] {
  const [, then, otherwise] = node.children;
  const [thenExit, otherExit] = [
    exitOf(then),
    present(otherwise).kind === 'none' ? undefined : exitOf(otherwise),
  ];
  const effects: [Effects, Effects] = [effectsOf([then], flow), effectsOf([otherwise], flow)];
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

function ifFlow(node: FlowNode, facts: readonly Fact[], flow: Flow): FlowStep {
  const [rawTest, then, otherwise] = node.children;
  const test = present(rawTest);
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

function loopFlow(node: FlowNode, facts: readonly Fact[], flow: Flow): FlowStep {
  const inLoop = afterEffects(facts, effectsOf([node], flow), flow.mutable);
  const body = node.kind === 'do' ? node.children[0] : node.children.at(-1);
  const { test, facts: entry } = loopEntry(node, flow);
  return {
    checks: test === undefined ? [] : [{ condition: test, facts: inLoop }],
    children: [{ statements: statementsOf(body), facts: [...inLoop, ...entry] }],
    after: inLoop,
  };
}

function otherFlow(node: FlowNode, facts: readonly Fact[], flow: Flow): FlowStep {
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

function isIf(node: FlowNode): node is FlowNode {
  return node.kind === 'if';
}

function isLoop(node: FlowNode): node is FlowNode {
  return LOOPS.has(node.kind);
}

function declaredNames(statements: readonly FlowNode[]): (string | undefined)[] {
  return statements
    .filter((statement) => statement.kind === 'declare')
    .map((statement) => statement.children[1]?.value);
}

function shadowed(facts: readonly Fact[], statements: readonly FlowNode[]): Fact[] {
  const declared = new Set(declaredNames(statements));
  return facts.filter((known) => ![...known.names].some((name) => declared.has(name)));
}

export function conditionChecks(body: readonly FlowNode[], flow: Flow): Check[] {
  return walkConditionChecks(body, flow, { shadowed, isIf, isLoop, ifFlow, loopFlow, otherFlow });
}
