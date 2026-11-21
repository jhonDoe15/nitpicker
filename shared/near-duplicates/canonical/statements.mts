import { KEY_MODES, keyOf } from '../tree/keys.mts';
import {
  NONE,
  contains,
  isBound,
  isJump,
  make,
  pairOf,
  placed,
  present,
  quadOf,
  tripleOf,
  withChildren,
} from '../tree/nodes.mts';
import type { TreeFields, TreeNode } from '../tree/tree-types.mts';
import { accessesOf, continuesLoop, isPure } from './effects.mts';
import { negationOf } from './expressions.mts';
import { loopMatch } from './library.mts';

const TRUE: TreeNode = Object.freeze({
  kind: 'literal',
  literal: 'boolean',
  value: 'true',
  children: Object.freeze([]),
});

function own(node: TreeNode): string {
  return keyOf(node, KEY_MODES.own);
}

function spanning(first: TreeNode, last: TreeNode): TreeFields {
  return placed(first.start, last.end);
}

function guardOf(statement: TreeNode | undefined): TreeNode | undefined {
  if (statement?.kind !== 'if' || present(statement.children[2]).kind !== 'none') {
    return undefined;
  }
  const body = present(statement.children[1]).children;
  const [first] = body;
  return body.length === 1 && isJump(first) ? first : undefined;
}

function plainAssignment(statements: readonly TreeNode[]): TreeNode | undefined {
  const [only] = statements;
  if (statements.length !== 1 || only?.kind !== 'evaluate') {
    return undefined;
  }
  const [expression] = only.children;
  return expression?.kind === 'assign' && expression.value === '=' ? expression : undefined;
}

function loopAsWhile(statement: TreeNode): TreeNode[] {
  const [init, condition, update, body] = quadOf(statement);
  if (continuesLoop(body) || contains(statement, (node) => node.kind === 'lambda')) {
    return [statement];
  }
  const test = condition.kind === 'none' ? TRUE : condition;
  const loopBody = make('block', [...body.children, ...update.children]);
  return [...init.children, make('while', [test, loopBody], spanning(statement, statement))];
}

function joinedAssignment(statement: TreeNode): TreeNode | undefined {
  const [condition, then, otherwise] = tripleOf(statement);
  const left = plainAssignment(then.children);
  const right = plainAssignment(otherwise.children);
  const joinable =
    left !== undefined &&
    right !== undefined &&
    own(present(left.children[0])) === own(present(right.children[0])) &&
    isPure(present(left.children[0]));
  if (!joinable) {
    return undefined;
  }
  const value = make('conditional', [
    condition,
    present(left.children[1]),
    present(right.children[1]),
  ]);
  return make(
    'evaluate',
    [withChildren(left, [present(left.children[0]), value])],
    spanning(statement, statement),
  );
}

function withoutElse(statement: TreeNode): TreeNode[] {
  const [condition, then] = pairOf(statement);
  const inner = then.children.length === 1 ? then.children[0] : undefined;
  if (inner?.kind !== 'if' || present(inner.children[2]).kind !== 'none') {
    return [statement];
  }
  const both = make('binary', [condition, present(inner.children[0])], {
    value: '&&',
    commutes: true,
  });
  return [withChildren(statement, [both, present(inner.children[1]), NONE])];
}

function withElse(statement: TreeNode): TreeNode[] {
  const [condition, then, otherwise] = tripleOf(statement);
  const negated = negationOf(condition);
  if (negated !== undefined) {
    return [withChildren(statement, [negated, otherwise, then])];
  }
  if (isJump(then.children.at(-1))) {
    return [withChildren(statement, [condition, then, NONE]), ...otherwise.children];
  }
  return [joinedAssignment(statement) ?? statement];
}

function branchesOf(statement: TreeNode): TreeNode[] {
  const [condition, then, otherwise] = tripleOf(statement);
  if (otherwise.kind === 'block' && otherwise.children.length === 0) {
    return [withChildren(statement, [condition, then, NONE])];
  }
  return otherwise.kind === 'none' ? withoutElse(statement) : withElse(statement);
}

function expanded(statement: TreeNode): readonly TreeNode[] {
  if (statement.kind === 'for') {
    return loopAsWhile(statement);
  }
  if (statement.kind === 'if') {
    return branchesOf(statement);
  }
  return statement.kind === 'block' ? statement.children : [statement];
}

function returnValue(statement: TreeNode | undefined): TreeNode | undefined {
  const [value] = statement?.kind === 'return' ? statement.children : [];
  return value !== undefined && value.kind !== 'none' ? value : undefined;
}

function mergedGuard(
  previous: TreeNode,
  statement: TreeNode,
  jump: TreeNode,
): TreeNode | undefined {
  const condition = present(previous.children[0]);
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
  const either = make('binary', [condition, present(statement.children[0])], {
    value: '||',
    commutes: true,
  });
  return withChildren(previous, [either, present(previous.children[1]), NONE]);
}

function mergedDeclaration(
  previous: TreeNode | undefined,
  statement: TreeNode,
): TreeNode | undefined {
  if (previous?.kind !== 'declare' || present(previous.children[2]).kind !== 'none') {
    return undefined;
  }
  const assignment = plainAssignment([statement]);
  const target = assignment?.children[0];
  const joinable =
    isBound(target) &&
    target.value === previous.children[1]?.value &&
    !accessesOf(present(assignment?.children[1])).reads.has(target.value);
  if (!joinable) {
    return undefined;
  }
  const [type, name] = pairOf(previous);
  return withChildren(previous, [type, name, present(assignment?.children[1])]);
}

function merged(previous: TreeNode | undefined, statement: TreeNode): TreeNode | undefined {
  const match = loopMatch(previous, statement);
  if (match !== undefined) {
    return match;
  }
  const jump = guardOf(previous);
  return jump === undefined || previous === undefined
    ? mergedDeclaration(previous, statement)
    : mergedGuard(previous, statement, jump);
}

export function rewriteStatements(statements: readonly TreeNode[]): TreeNode[] {
  const result: TreeNode[] = [];
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
