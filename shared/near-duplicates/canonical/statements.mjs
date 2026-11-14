import { KEY_MODES, keyOf } from '../tree/keys.mjs';
import { NONE, contains, isBound, isJump, make, withChildren } from '../tree/nodes.mjs';
import { accessesOf, continuesLoop, isPure } from './effects.mjs';
import { negationOf } from './expressions.mjs';
import { loopMatch } from './library.mjs';

const TRUE = Object.freeze({
  kind: 'literal',
  literal: 'boolean',
  value: 'true',
  children: Object.freeze([]),
});

function own(node) {
  return keyOf(node, KEY_MODES.own);
}

function spanning(first, last) {
  return { start: first.start, end: last.end };
}

function guardOf(statement) {
  if (statement?.kind !== 'if' || statement.children[2].kind !== 'none') {
    return undefined;
  }
  const body = statement.children[1].children;
  return body.length === 1 && isJump(body[0]) ? body[0] : undefined;
}

function plainAssignment(statements) {
  if (statements.length !== 1 || statements[0].kind !== 'evaluate') {
    return undefined;
  }
  const [expression] = statements[0].children;
  return expression.kind === 'assign' && expression.value === '=' ? expression : undefined;
}

function loopAsWhile(statement) {
  const [init, condition, update, body] = statement.children;
  if (continuesLoop(body) || contains(statement, (node) => node.kind === 'lambda')) {
    return [statement];
  }
  const test = condition.kind === 'none' ? TRUE : condition;
  const loopBody = make('block', [...body.children, ...update.children]);
  return [...init.children, make('while', [test, loopBody], spanning(statement, statement))];
}

function joinedAssignment(statement) {
  const [condition, then, otherwise] = statement.children;
  const left = plainAssignment(then.children);
  const right = plainAssignment(otherwise.children);
  const joinable =
    left !== undefined &&
    right !== undefined &&
    own(left.children[0]) === own(right.children[0]) &&
    isPure(left.children[0]);
  if (!joinable) {
    return undefined;
  }
  const value = make('conditional', [condition, left.children[1], right.children[1]]);
  return make(
    'evaluate',
    [withChildren(left, [left.children[0], value])],
    spanning(statement, statement),
  );
}

function withoutElse(statement) {
  const [condition, then] = statement.children;
  const inner = then.children.length === 1 ? then.children[0] : undefined;
  if (inner?.kind !== 'if' || inner.children[2].kind !== 'none') {
    return [statement];
  }
  const both = make('binary', [condition, inner.children[0]], { value: '&&', commutes: true });
  return [withChildren(statement, [both, inner.children[1], NONE])];
}

function withElse(statement) {
  const [condition, then, otherwise] = statement.children;
  const negated = negationOf(condition);
  if (negated !== undefined) {
    return [withChildren(statement, [negated, otherwise, then])];
  }
  if (isJump(then.children.at(-1))) {
    return [withChildren(statement, [condition, then, NONE]), ...otherwise.children];
  }
  return [joinedAssignment(statement) ?? statement];
}

function branchesOf(statement) {
  const [condition, then, otherwise] = statement.children;
  if (otherwise.kind === 'block' && otherwise.children.length === 0) {
    return [withChildren(statement, [condition, then, NONE])];
  }
  return otherwise.kind === 'none' ? withoutElse(statement) : withElse(statement);
}

function expanded(statement) {
  if (statement.kind === 'for') {
    return loopAsWhile(statement);
  }
  if (statement.kind === 'if') {
    return branchesOf(statement);
  }
  return statement.kind === 'block' ? statement.children : [statement];
}

function returnValue(statement) {
  return statement?.kind === 'return' && statement.children[0].kind !== 'none'
    ? statement.children[0]
    : undefined;
}

function mergedGuard(previous, statement, jump) {
  const [condition] = previous.children;
  const early = returnValue(jump);
  const late = returnValue(statement);
  if (early !== undefined && late !== undefined) {
    return make(
      'return',
      [make('conditional', [condition, early, late])],
      spanning(previous, statement),
    );
  }
  const second = guardOf(statement);
  if (second === undefined || own(second) !== own(jump)) {
    return undefined;
  }
  const either = make('binary', [condition, statement.children[0]], {
    value: '||',
    commutes: true,
  });
  return withChildren(previous, [either, previous.children[1], NONE]);
}

function mergedDeclaration(previous, statement) {
  if (previous?.kind !== 'declare' || previous.children[2].kind !== 'none') {
    return undefined;
  }
  const assignment = plainAssignment([statement]);
  const target = assignment?.children[0];
  const joinable =
    isBound(target) &&
    target.value === previous.children[1].value &&
    !accessesOf(assignment.children[1]).reads.has(target.value);
  if (!joinable) {
    return undefined;
  }
  const [type, name] = previous.children;
  return withChildren(previous, [type, name, assignment.children[1]]);
}

function merged(previous, statement) {
  const match = loopMatch(previous, statement);
  if (match !== undefined) {
    return match;
  }
  const jump = guardOf(previous);
  return jump === undefined
    ? mergedDeclaration(previous, statement)
    : mergedGuard(previous, statement, jump);
}

export function rewriteStatements(statements) {
  const result = [];
  for (const statement of statements.flatMap(expanded)) {
    const joined = merged(result.at(-1), statement);
    if (joined === undefined) {
      result.push(statement);
    } else {
      result[result.length - 1] = joined;
    }
  }
  return result;
}
