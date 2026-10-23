import ts from 'typescript';
import { chainOf } from '../../../../../../shared/traversal.mjs';
import { lineOf, unwrap } from '../../syntax/nodes.mjs';
import { conditionArm, constantOf, subjectKey } from './constants.mjs';
import { subjectOf } from './subject.mjs';

function branches(node) {
  return ts.isIfStatement(node)
    ? { condition: node.expression, otherwise: node.elseStatement }
    : { condition: node.condition, otherwise: node.whenFalse };
}

function nextLink(otherwise) {
  const node = otherwise === undefined ? undefined : unwrap(otherwise);
  return node !== undefined && (ts.isIfStatement(node) || ts.isConditionalExpression(node))
    ? node
    : undefined;
}

function matchingArm(scope, cursor, arms) {
  const arm = conditionArm(scope, branches(cursor).condition);
  const sameSubject =
    arm !== undefined &&
    (arms.length === 0 || subjectKey(arm.subject) === subjectKey(arms[0].subject));
  return sameSubject ? arm : undefined;
}

function chainArms(scope, start, consumed) {
  const arms = [];
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
  const otherwise = lastMatched ? branches(links.at(-1)).otherwise !== undefined : arms.length > 0;
  return { arms, otherwise };
}

function conditionalDecision(scope, node, consumed) {
  const { arms, otherwise } = chainArms(scope, node, consumed);
  const subject =
    arms.length === 0
      ? undefined
      : subjectOf(
          scope,
          arms[0].subject,
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

function groupClauses(clauses, values) {
  const groups = [];
  let pending = [];
  for (const [index, clause] of clauses.entries()) {
    if (ts.isDefaultClause(clause)) {
      pending = [];
      continue;
    }
    pending.push(values[index]);
    if (clause.statements.length > 0) {
      groups.push(pending);
      pending = [];
    }
  }
  return pending.length > 0 ? [...groups, pending] : groups;
}

function switchGroups(scope, node) {
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

function switchDecision(scope, node) {
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

export function decisionFacts(scope) {
  const consumed = new Set();
  const decisions = [];
  for (const node of scope.nodes) {
    let decision;
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
