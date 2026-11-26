import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { nameOf } from '../typed/node-views.mts';
import { descendants, methodCall } from '../recursion/graph/file-calls.mts';

export type Worklist = {
  readonly loop: TSESTree.ForOfStatement | TSESTree.WhileStatement;
  readonly list: string;
  readonly pushes: readonly TSESTree.CallExpression[];
};

const APPENDS = new Set(['push', 'unshift']);
const TAKES = new Set(['pop', 'shift']);

function listOf(loop: TSESTree.ForOfStatement | TSESTree.WhileStatement): string | undefined {
  if (loop.type === AST_NODE_TYPES.ForOfStatement) {
    const { right } = loop;
    return right.type === AST_NODE_TYPES.MemberExpression &&
      right.object.type === AST_NODE_TYPES.ThisExpression
      ? nameOf(right.property)
      : nameOf(right);
  }
  const taken = descendants(loop.body).flatMap((node) => {
    const call = methodCall(node);
    return call !== undefined && TAKES.has(call.method) ? [call.receiver] : [];
  });
  return taken.find((name) => name !== '');
}

export function worklistOf(node: TSESTree.Node): Worklist | undefined {
  if (node.type !== AST_NODE_TYPES.ForOfStatement && node.type !== AST_NODE_TYPES.WhileStatement) {
    return undefined;
  }
  const list = listOf(node);
  const pushes =
    list === undefined ? [] : callsWhere(node.body, APPENDS, (receiver) => receiver === list);
  return list !== undefined && pushes.length > 0 ? { loop: node, list, pushes } : undefined;
}

function callsWhere(
  body: TSESTree.Node,
  methods: ReadonlySet<string>,
  onReceiver: (receiver: string) => boolean,
): TSESTree.CallExpression[] {
  return descendants(body).filter((node): node is TSESTree.CallExpression => {
    const call = methodCall(node);
    return call !== undefined && methods.has(call.method) && onReceiver(call.receiver);
  });
}

export function callsOffList(
  body: TSESTree.Node,
  methods: ReadonlySet<string>,
  list: string,
): TSESTree.CallExpression[] {
  return callsWhere(body, methods, (receiver) => receiver !== list);
}
