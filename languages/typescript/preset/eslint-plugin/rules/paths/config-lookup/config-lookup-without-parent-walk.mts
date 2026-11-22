import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { isTestFile } from '../../analysis/test-files/test-file-path.mts';
import { fallsBackToDefault, joinedConfigName, moduleWalksParents } from './parent-walk-check.mts';

const FS_LOOKUP_METHODS = new Set([
  'existsSync',
  'statSync',
  'accessSync',
  'readFileSync',
  'stat',
  'access',
  'readFile',
]);

function lookupMethodName(callee: TSESTree.Expression): string | undefined {
  if (callee.type === AST_NODE_TYPES.Identifier && FS_LOOKUP_METHODS.has(callee.name)) {
    return callee.name;
  }
  if (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.property.type === AST_NODE_TYPES.Identifier &&
    FS_LOOKUP_METHODS.has(callee.property.name)
  ) {
    return callee.property.name;
  }
  return undefined;
}

export const rule: TSESLint.RuleModule<'configLookupWithoutParentWalk'> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require walking parent directories before falling back to a default for parent-searched tool config files',
    },
    schema: [],
    messages: {
      configLookupWithoutParentWalk:
        'The tool that reads {{config}} searches parent folders too, so checking only one folder causes a nested package covered by a higher {{config}} to silently fall back to the default config. Walk parent folders with path.dirname up to the repository root before falling back.',
    },
  },
  create(context) {
    if (isTestFile(context.filename)) {
      return {};
    }
    let walksParents = false;
    return {
      Program(node) {
        walksParents = moduleWalksParents(context, node);
      },
      CallExpression(node) {
        if (walksParents || lookupMethodName(node.callee) === undefined) {
          return;
        }
        const config = joinedConfigName(context, node.arguments[0]);
        if (config !== undefined && fallsBackToDefault(node)) {
          context.report({
            node,
            messageId: 'configLookupWithoutParentWalk',
            data: { config },
          });
        }
      },
    };
  },
};
