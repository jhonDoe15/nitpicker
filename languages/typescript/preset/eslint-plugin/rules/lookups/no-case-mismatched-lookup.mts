import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import {
  findVariable,
  isFunctionNode,
  type SourceContext,
} from '../analysis/constant-resolution.mts';
import { ancestorsOf, depthFirst, nodeChildren } from '../typed/node-views.mts';
import { unwrapped } from '../typed/syntax-views.mts';
import { type Casing, hasCase, literalKeys, normalizedKey } from './case-keys.mts';

type MessageId = 'original' | 'raw';
type Node = TSESTree.Node;

const LOOKUPS = new Set(['includes', 'has', 'get', 'indexOf', 'delete']);
const FILLS = new Set(['add', 'set', 'push']);
const MAX_TEXT = 40;

function methodCall(node: TSESTree.CallExpression) {
  const callee = unwrapped(node.callee);
  const [key] = node.arguments;
  return callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.property.type === AST_NODE_TYPES.Identifier &&
    key !== undefined &&
    key.type !== AST_NODE_TYPES.SpreadElement
    ? { receiver: callee.object, method: callee.property.name, key }
    : undefined;
}

function parameterBuilt(context: SourceContext, collection: Node): boolean {
  if (collection.type !== AST_NODE_TYPES.Identifier) {
    return false;
  }
  const definition = findVariable(context, collection, collection.name)?.defs[0];
  const init =
    definition?.node.type === AST_NODE_TYPES.VariableDeclarator ? definition.node.init : undefined;
  const source = init?.type === AST_NODE_TYPES.NewExpression ? init.arguments[0] : undefined;
  if (source?.type !== AST_NODE_TYPES.Identifier) {
    return false;
  }
  return findVariable(context, source, source.name)?.defs[0]?.type === 'Parameter';
}

function scopeRoot(node: Node, receiver: Node): Node {
  const ancestors = ancestorsOf(node);
  const member = receiver.type === AST_NODE_TYPES.MemberExpression;
  const owner = ancestors.find((each) =>
    member ? each.type === AST_NODE_TYPES.ClassBody : isFunctionNode(each),
  );
  return owner ?? ancestors.at(-1) ?? node;
}

function filledCasing(
  context: SourceContext,
  node: TSESTree.CallExpression,
  call: { readonly receiver: Node; readonly key: Node },
): Casing | undefined {
  const { sourceCode } = context;
  const plain =
    call.key.type === AST_NODE_TYPES.Identifier ||
    call.key.type === AST_NODE_TYPES.MemberExpression;
  const text = sourceCode.getText(call.key);
  for (const each of depthFirst<Node>(scopeRoot(node, call.receiver), nodeChildren)) {
    const fill = each.type === AST_NODE_TYPES.CallExpression ? methodCall(each) : undefined;
    const filled = fill === undefined ? undefined : normalizedKey(fill.key);
    if (
      plain &&
      fill !== undefined &&
      FILLS.has(fill.method) &&
      filled !== undefined &&
      sourceCode.getText(fill.receiver) === sourceCode.getText(call.receiver) &&
      sourceCode.getText(filled.inner) === text
    ) {
      return filled.casing;
    }
  }
  return undefined;
}

function shortText(text: string): string {
  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}...` : text;
}

export const rule: TSESLint.RuleModule<MessageId, []> = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Look a case-normalized key up in a collection that is normalized the same way',
    },
    schema: [],
    messages: {
      original:
        'The key is {{casing}}-cased but `{{collection}}` holds values in their original case, ' +
        'so a value that is not already {{casing}}-case never matches. ' +
        'Normalize both sides where the collection is built, or compare case-insensitively.',
      raw:
        '`{{collection}}` is filled with the {{casing}}-cased `{{key}}` but looked up as written, ' +
        'so a value with other capitals misses. Normalize the key on both sides.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const call = methodCall(node);
        if (call === undefined || !LOOKUPS.has(call.method)) {
          return;
        }
        const { sourceCode } = context;
        const collection = shortText(sourceCode.getText(call.receiver));
        const normalized = normalizedKey(call.key);
        if (normalized !== undefined) {
          const keys = literalKeys(context, call.receiver);
          const mismatch = keys?.some((value) => hasCase(value, normalized.casing)) === true;
          if (mismatch || parameterBuilt(context, call.receiver)) {
            context.report({
              node,
              messageId: 'original',
              data: { casing: normalized.casing, collection },
            });
          }
          return;
        }
        const filled = filledCasing(context, node, call);
        if (filled !== undefined) {
          context.report({
            node,
            messageId: 'raw',
            data: { casing: filled, collection, key: shortText(sourceCode.getText(call.key)) },
          });
        }
      },
    };
  },
};
