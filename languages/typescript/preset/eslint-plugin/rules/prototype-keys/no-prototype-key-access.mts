import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { resolveConstant } from '../analysis/constant-resolution.mts';
import { ASSERTION_FORMS, isFunction, unwrapOf } from '../typed/syntax-views.mts';
import { ancestorsOf, nameOf } from '../typed/node-views.mts';
import { descendants, guardsTarget } from './key-guards.mts';
import { loopOf, type KeyLoop } from './loop-keys.mts';
import { inLookup } from './in-lookups.mts';

const MERGE_NAME = /merge|extend|defaults|assign/i;

type Rule = TSESLint.RuleModule<'write' | 'lookup'>;
type Context = Readonly<TSESLint.RuleContext<'write' | 'lookup', []>>;
type Member = TSESTree.MemberExpression;

function isKeyed(node: TSESTree.Node, key: string): node is Member {
  return (
    node.type === AST_NODE_TYPES.MemberExpression &&
    node.computed &&
    unwrapOf(node.property, ASSERTION_FORMS).type === AST_NODE_TYPES.Identifier &&
    nameOf(unwrapOf(node.property, ASSERTION_FORMS)) === key
  );
}

function isNullPrototype(context: Context, node: TSESTree.Node): boolean {
  const value = resolveConstant(context, node);
  return (
    value?.type === AST_NODE_TYPES.CallExpression &&
    value.callee.type === AST_NODE_TYPES.MemberExpression &&
    nameOf(value.callee.property) === 'create' &&
    nameOf(value.callee.object) === 'Object'
  );
}

function isRead(node: Member): boolean {
  const { parent } = node;
  return !(parent.type === AST_NODE_TYPES.AssignmentExpression && parent.left === node);
}

function isMergeCall(node: Member, loop: TSESTree.Node): boolean {
  const call = node.parent;
  if (call.type !== AST_NODE_TYPES.CallExpression || !call.arguments.includes(node)) {
    return false;
  }
  const name =
    call.callee.type === AST_NODE_TYPES.MemberExpression
      ? nameOf(call.callee.property)
      : nameOf(call.callee);
  return name !== undefined && (MERGE_NAME.test(name) || name === enclosingName(loop));
}

function enclosingName(node: TSESTree.Node): string | undefined {
  const owner = ancestorsOf(node).find(isFunction);
  if (owner?.type === AST_NODE_TYPES.FunctionDeclaration) {
    return owner.id?.name;
  }
  const holder = owner?.parent;
  return holder?.type === AST_NODE_TYPES.VariableDeclarator ? nameOf(holder.id) : undefined;
}

function pollutingWrite(
  context: Context,
  { key, body, source }: KeyLoop,
): TSESTree.Node | undefined {
  const sourceText = source === undefined ? undefined : context.sourceCode.getText(source);
  const nodes = [...descendants(body)];
  const merges = nodes.filter(
    (node): node is Member => isKeyed(node, key) && isRead(node) && isMergeCall(node, body),
  );
  for (const node of nodes) {
    const target =
      node.type === AST_NODE_TYPES.AssignmentExpression && isKeyed(node.left, key)
        ? node.left
        : undefined;
    const owner = target?.object;
    if (owner === undefined || isNullPrototype(context, owner)) {
      continue;
    }
    const text = context.sourceCode.getText(owner);
    if (
      text !== sourceText &&
      merges.some((read) => context.sourceCode.getText(read.object) === text)
    ) {
      return guardsTarget({ node: body, target: text, key, sourceCode: context.sourceCode })
        ? undefined
        : node;
    }
  }
  return undefined;
}

export const rule: Rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Report merges written by input keys and in-lookups on plain objects ' +
        'that treat __proto__, constructor and prototype as keys',
    },
    schema: [],
    messages: {
      write:
        'This loop writes `target[key]` for every input key, so `__proto__`, `constructor` or ' +
        '`prototype` reaches `Object.prototype`. Skip those keys, check `Object.hasOwn(target, key)`, ' +
        'or merge into a `Map` or an `Object.create(null)` object.',
      lookup:
        'This `in` check on a plain object also matches inherited members such as `constructor`. ' +
        'Use `Object.hasOwn(table, key)`, a `Map`, or an `Object.create(null)` table.',
    },
  },
  create(context) {
    function check(node: TSESTree.Node): void {
      const loop = loopOf(node);
      const write = loop === undefined ? undefined : pollutingWrite(context, loop);
      if (write !== undefined) {
        context.report({ node: write, messageId: 'write' });
      }
    }
    return {
      ForInStatement: check,
      ForOfStatement: check,
      CallExpression: check,
      BinaryExpression(node: TSESTree.BinaryExpression) {
        if (inLookup(context, node)) {
          context.report({ node, messageId: 'lookup' });
        }
      },
    };
  },
};
