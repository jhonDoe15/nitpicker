import type TypeScript from 'typescript';
import { ts, chainOf } from '../../syntax/typed.mts';
import { lineOf, unwrap } from '../../syntax/nodes.mts';
import { conditionArm, constantOf, subjectKey } from './constants.mts';
import { subjectOf } from './subject.mts';
import type { Scope } from '../../design-types.mts';

type Node = TypeScript.Node;
type Conditional = TypeScript.IfStatement | TypeScript.ConditionalExpression;
type Arm = { subject: Node; constants: string[] };
type Decision = { subject: string; groups: string[][]; line: number; otherwise?: true };

function branches(node: Conditional): { condition: Node; otherwise: Node | undefined } {
  return ts.isIfStatement(node)
    ? { condition: node.expression, otherwise: node.elseStatement }
    : { condition: node.condition, otherwise: node.whenFalse };
}

function nextLink(otherwise: Node | undefined): Conditional | undefined {
  const node = otherwise === undefined ? undefined : unwrap(otherwise);
  return node !== undefined && (ts.isIfStatement(node) || ts.isConditionalExpression(node))
    ? node
    : undefined;
}

function matchingArm(scope: Scope, cursor: Conditional, arms: readonly Arm[]): Arm | undefined {
  const arm = conditionArm(scope, branches(cursor).condition);
  const [first] = arms;
  const sameSubject =
    arm !== undefined &&
    (first === undefined || subjectKey(arm.subject) === subjectKey(first.subject));
  return sameSubject ? arm : undefined;
}

function chainArms(
  scope: Scope,
  start: Conditional,
  consumed: Set<Node>,
): { arms: Arm[]; otherwise: boolean } {
  const arms: Arm[] = [];
  const links = chainOf(start, (cursor) => {
    const arm = matchingArm(scope, cursor, arms);
    if (arm === undefined) {
      return undefined;
    }
    arms.push(arm);
    return nextLink(branches(cursor).otherwise);
  });
  for (const link of links.slice(1, arms.length)) {
    consumed.add(link);
  }
  const lastMatched = arms.length === links.length;
  const last = links.at(-1);
  const otherwise =
    lastMatched && last !== undefined ? branches(last).otherwise !== undefined : arms.length > 0;
  return { arms, otherwise };
}

function conditionalDecision(
  scope: Scope,
  node: Conditional,
  consumed: Set<Node>,
): Decision | undefined {
  const { arms, otherwise } = chainArms(scope, node, consumed);
  const [first] = arms;
  const subject =
    first === undefined
      ? undefined
      : subjectOf(
          scope,
          first.subject,
          arms.flatMap(({ constants }) => constants),
        );
  return subject === undefined
    ? undefined
    : {
        subject,
        groups: arms.map(({ constants }) => constants),
        line: lineOf(node),
        ...(otherwise ? { otherwise } : {}),
      };
}

function groupClauses(
  clauses: readonly TypeScript.CaseOrDefaultClause[],
  values: readonly (string | undefined)[],
): string[][] {
  const groups: string[][] = [];
  let pending: string[] = [];
  for (const [index, clause] of clauses.entries()) {
    if (ts.isDefaultClause(clause)) {
      pending = [];
      continue;
    }
    const value = values[index];
    if (value !== undefined) {
      pending.push(value);
    }
    if (clause.statements.length > 0) {
      groups.push(pending);
      pending = [];
    }
  }
  return pending.length > 0 ? [...groups, pending] : groups;
}

function switchGroups(
  scope: Scope,
  node: TypeScript.SwitchStatement,
): { groups: string[][]; otherwise: boolean } | undefined {
  const clauses = node.caseBlock.clauses;
  const values = clauses.map((clause) =>
    ts.isDefaultClause(clause) ? undefined : constantOf(scope, clause.expression),
  );
  const invalid = clauses.some(
    (clause, index) => !ts.isDefaultClause(clause) && values[index] === undefined,
  );
  return invalid
    ? undefined
    : { groups: groupClauses(clauses, values), otherwise: clauses.some(ts.isDefaultClause) };
}

function switchDecision(scope: Scope, node: TypeScript.SwitchStatement): Decision | undefined {
  const shape = switchGroups(scope, node);
  if (shape === undefined || shape.groups.length === 0) {
    return undefined;
  }
  const subject = subjectOf(scope, node.expression, shape.groups.flat());
  return subject === undefined
    ? undefined
    : {
        subject,
        groups: shape.groups,
        line: lineOf(node),
        ...(shape.otherwise ? { otherwise: true } : {}),
      };
}

export function decisionFacts(scope: Scope): Decision[] {
  const consumed = new Set<Node>();
  const decisions: Decision[] = [];
  for (const node of scope.nodes) {
    let decision: Decision | undefined;
    if (ts.isSwitchStatement(node)) {
      decision = switchDecision(scope, node);
    } else if (
      (ts.isIfStatement(node) || ts.isConditionalExpression(node)) &&
      !consumed.has(node)
    ) {
      decision = conditionalDecision(scope, node, consumed);
    }
    if (decision !== undefined) {
      decisions.push(decision);
    }
  }
  return decisions;
}
