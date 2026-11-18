import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { typeServices } from '../../security/security-values.mts';
import { calleeNameOf } from '../../typed/syntax-views.mts';
import { hasDollarGuard } from './dollar-guards.mts';
import { isCallable, isSafeReplacement, isStringType } from './replacement-values.mts';

type Docs = { readonly requiresTypeChecking: boolean };
const REPLACE_METHODS = new Set<string>(['replace', 'replaceAll']);

export const rule: TSESLint.RuleModule<'expandingReplacement', [], Docs> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow a non-constant replacement string in String replace and replaceAll, which expands $ patterns',
      requiresTypeChecking: true,
    },
    schema: [],
    messages: {
      expandingReplacement:
        "`{{ method }}` reads `$&`, `$1`, `$$` and similar sequences in a replacement string, so a `$` in `{{ value }}` is expanded instead of inserted. Pass a function (`{{ method }}(pattern, () => {{ value }})`), or escape the dollars (`value.replace(/\\$/g, '$$$$')`). A constant replacement that uses `$1` on purpose is fine.",
    },
  },
  create(context) {
    const services = typeServices(context);
    if (services === undefined) {
      return {};
    }
    const typeOf = (node: TSESTree.Node) => services.getTypeAtLocation(node);
    return {
      CallExpression(node) {
        const method = calleeNameOf(node.callee) ?? '';
        const [, replacement] = node.arguments;
        if (
          node.callee.type !== AST_NODE_TYPES.MemberExpression ||
          !REPLACE_METHODS.has(method) ||
          node.arguments.length !== 2 ||
          replacement === undefined ||
          replacement.type === AST_NODE_TYPES.SpreadElement ||
          !isStringType(typeOf(node.callee.object)) ||
          isCallable(typeOf(replacement)) ||
          isSafeReplacement(context, typeOf, replacement) ||
          hasDollarGuard(context, replacement)
        ) {
          return;
        }
        context.report({
          node: replacement,
          messageId: 'expandingReplacement',
          data: { method, value: context.sourceCode.getText(replacement) },
        });
      },
    };
  },
};
