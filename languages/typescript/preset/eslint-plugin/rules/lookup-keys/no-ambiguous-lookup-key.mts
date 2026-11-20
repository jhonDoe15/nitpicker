import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { resolveConstant } from '../analysis/constant-resolution.mts';
import { compositeParts } from './key-shapes.mts';
import { hasStringIndex, partKind, receiverTypeName } from './part-types.mts';

const MAP_METHODS = new Set(['set', 'get', 'has', 'delete']);
const SET_METHODS = new Set(['add', 'has', 'delete']);
const MIN_STRING_PARTS = 2;
const GENERATED = /Date\.now|Math\.random|randomUUID|randomBytes|nanoid|uuid/iu;
const MAP_TYPES = new Set(['Map', 'WeakMap']);

function isKeyedCall(
  context: Parameters<typeof receiverTypeName>[0],
  node: TSESTree.CallExpression,
): boolean {
  const { callee } = node;
  if (
    callee.type !== AST_NODE_TYPES.MemberExpression ||
    callee.property.type !== AST_NODE_TYPES.Identifier
  ) {
    return false;
  }
  const type = receiverTypeName(context, callee.object);
  const method = callee.property.name;
  return (
    (type !== undefined && MAP_TYPES.has(type) && MAP_METHODS.has(method)) ||
    (type === 'Set' && SET_METHODS.has(method))
  );
}

export const rule: TSESLint.RuleModule<'ambiguousKey'> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow lookup keys joined from runtime strings with a delimiter the parts can contain',
    },
    schema: [],
    messages: {
      ambiguousKey:
        'This key joins runtime values with a delimiter, so `"a-b"` and `"c"` collide with `"a"` and `"b-c"` ' +
        '(one entry overwrites or answers for another), and an object part becomes `[object Object]`. Key ' +
        'it with `JSON.stringify([a, b])`, a nested `Map`, or parts that are encoded so the delimiter cannot ' +
        'appear in them. Numbers, ids that cannot hold the delimiter and enum or literal-union parts are ' +
        'fine.',
    },
  },
  create(context) {
    function check(key: TSESTree.Node | undefined): void {
      const source = key === undefined ? undefined : resolveConstant(context, key);
      const parts =
        key === undefined ||
        source === undefined ||
        GENERATED.test(context.sourceCode.getText(source))
          ? undefined
          : compositeParts(context, key);
      const kinds = (parts ?? []).map((part) => partKind(context, part));
      const strings = kinds.filter((kind) => kind === 'string').length;
      if (key !== undefined && (kinds.includes('object') || strings >= MIN_STRING_PARTS)) {
        context.report({ node: key, messageId: 'ambiguousKey' });
      }
    }

    return {
      CallExpression(node: TSESTree.CallExpression) {
        const [key] = node.arguments;
        if (
          key !== undefined &&
          key.type !== AST_NODE_TYPES.SpreadElement &&
          isKeyedCall(context, node)
        ) {
          check(key);
        }
      },
      AssignmentExpression(node: TSESTree.AssignmentExpression) {
        const { left } = node;
        if (
          left.type === AST_NODE_TYPES.MemberExpression &&
          left.computed &&
          hasStringIndex(context, left.object)
        ) {
          check(left.property);
        }
      },
    };
  },
};
