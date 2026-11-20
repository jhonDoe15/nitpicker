import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { typedServices } from '../decided/facts.mts';
import { nameOf } from '../typed/node-views.mts';
import { lossyTypeOf } from './lossy-types.mts';

export function isJsonCall(callee: TSESTree.Node, method: string): boolean {
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    nameOf(callee.object) === 'JSON' &&
    nameOf(callee.property) === method
  );
}

function hasReplacer(args: readonly TSESTree.CallExpressionArgument[]): boolean {
  const [, replacer] = args;
  return (
    replacer !== undefined &&
    !(
      (replacer.type === AST_NODE_TYPES.Literal && replacer.value === null) ||
      nameOf(replacer) === 'undefined'
    )
  );
}

export const rule: TSESLint.RuleModule<
  'lossy',
  readonly [],
  { readonly requiresTypeChecking: boolean }
> = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Report JSON.stringify of a value whose type holds a bigint, Map, Set or RegExp',
      requiresTypeChecking: true,
    },
    schema: [],
    messages: {
      lossy:
        'JSON.stringify gets a value whose type holds a {{kind}}: a bigint throws, and a Map, Set ' +
        'or RegExp becomes `{}`. Convert before the call (`String(id)`, `[...map]`, ' +
        '`Object.fromEntries(map)`), add `toJSON`, or pass a replacer.',
    },
  },
  create(context) {
    const services = context.sourceCode.parserServices;
    if (!typedServices(services)) {
      return {};
    }
    const checker = services.program.getTypeChecker();
    return {
      CallExpression(node: TSESTree.CallExpression) {
        const [value] = node.arguments;
        if (
          !isJsonCall(node.callee, 'stringify') ||
          value === undefined ||
          hasReplacer(node.arguments)
        ) {
          return;
        }
        if (value.type === AST_NODE_TYPES.SpreadElement) {
          return;
        }
        const tsNode = services.esTreeNodeToTSNodeMap.get(value);
        const kind = lossyTypeOf(checker, tsNode, checker.getTypeAtLocation(tsNode));
        if (kind !== undefined) {
          context.report({ node, messageId: 'lossy', data: { kind } });
        }
      },
    };
  },
};
