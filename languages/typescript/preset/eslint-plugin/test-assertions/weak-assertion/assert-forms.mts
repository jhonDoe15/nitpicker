import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { memberName } from '../../rules/analysis/test-code-analysis.mts';
import {
  lengthName,
  nonEmptyComparison,
  nullishName,
  isNumber,
  presenceComparison,
} from './values.mts';

export type AssertForm = {
  readonly family: 'presence' | 'nonEmpty';
  readonly absent?: string | undefined;
  readonly narrowed?: TSESTree.Node | undefined;
};

function isAssertObject(node: TSESTree.Node): boolean {
  const base =
    node.type === AST_NODE_TYPES.MemberExpression && memberName(node) === 'strict'
      ? node.object
      : node;
  return base.type === AST_NODE_TYPES.Identifier && base.name === 'assert';
}

function assertMethod(callee: TSESTree.Node): string | undefined {
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return callee.name === 'assert' ? 'ok' : undefined;
  }
  if (callee.type !== AST_NODE_TYPES.MemberExpression || !isAssertObject(callee.object)) {
    return undefined;
  }
  return memberName(callee);
}

const NOT_EQUAL_METHODS = new Set(['notEqual', 'notStrictEqual']);

function notEqualForm([first, second]: readonly TSESTree.Node[]): AssertForm | undefined {
  const absent = nullishName(second) ?? nullishName(first);
  if (absent !== undefined) {
    return { family: 'presence', absent };
  }
  const isZeroLength =
    (lengthName(first) !== undefined && isNumber(second, 0)) ||
    (lengthName(second) !== undefined && isNumber(first, 0));
  return isZeroLength ? { family: 'nonEmpty' } : undefined;
}

function okForm([condition]: readonly TSESTree.Node[]): AssertForm | undefined {
  const presence = presenceComparison(condition);
  if (presence) {
    return { family: 'presence', absent: presence.absent, narrowed: presence.subject };
  }
  const isNonEmpty =
    nonEmptyComparison(condition) !== undefined || lengthName(condition) !== undefined;
  return isNonEmpty ? { family: 'nonEmpty' } : undefined;
}

export function assertForm(call: TSESTree.CallExpression): AssertForm | undefined {
  const method = assertMethod(call.callee);
  if (method === 'ok') {
    return okForm(call.arguments);
  }
  return method !== undefined && NOT_EQUAL_METHODS.has(method)
    ? notEqualForm(call.arguments)
    : undefined;
}
