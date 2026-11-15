import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { resolveConstant } from '../../analysis/test-code-analysis.mts';
import { collectObjectKeys } from '../object-keys.mts';
import { keyName } from '../../../fixes/support/objects.mts';
import { isNamedMember } from '../../typed/syntax-views.mts';
import { fixable } from '../../../fixes/support/descriptors.mts';
import { pinsFix } from '../../../fixes/tests/tsconfig-pins-fix.mts';

export const rule: TSESLint.RuleModule<'unpinnedTsconfig'> = {
  meta: {
    type: 'problem',
    fixable: 'code',
    schema: [],
    messages: {
      unpinnedTsconfig:
        "A tsconfig a test writes must set compilerOptions.types and compilerOptions.lib (or noLib), for example types: [] and lib: ['ES2022'], so tsc does not load every @types package and the full default lib.",
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (!isNamedMember(node.callee, 'JSON', 'stringify')) {
          return;
        }
        const config = resolveConstant(context, node.arguments[0]);
        if (config?.type !== AST_NODE_TYPES.ObjectExpression) {
          return;
        }
        const compilerOptions = config.properties.find(
          (property): property is TSESTree.Property =>
            property.type === AST_NODE_TYPES.Property && keyName(property) === 'compilerOptions',
        );
        if (compilerOptions === undefined) {
          return;
        }
        const { keys, complete } = collectObjectKeys(context, compilerOptions.value, keyName);
        if (!complete) {
          return;
        }
        if (keys.has('types') && (keys.has('lib') || keys.has('noLib'))) {
          return;
        }
        context.report(
          fixable(
            { node: compilerOptions, messageId: 'unpinnedTsconfig' },
            pinsFix(context.sourceCode, compilerOptions),
          ),
        );
      },
    };
  },
};
