import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { resolveConstant } from '../../analysis/test-code-analysis.mts';
import type { SourceContext } from '../../analysis/constant-resolution.mts';
import { fixable } from '../../../fixes/support/descriptors.mts';
import { pinsFix } from '../../../fixes/tests/tsconfig-pins-fix.mts';

function propertyName(property: TSESTree.ObjectLiteralElement): string | undefined {
  if (property.type !== AST_NODE_TYPES.Property || property.computed) {
    return undefined;
  }
  if (property.key.type === AST_NODE_TYPES.Identifier) {
    return property.key.name;
  }
  return String(property.key.value);
}

function isJsonStringify(callee: TSESTree.Node): boolean {
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.object.type === AST_NODE_TYPES.Identifier &&
    callee.object.name === 'JSON' &&
    callee.property.type === AST_NODE_TYPES.Identifier &&
    callee.property.name === 'stringify'
  );
}

function recordKey(
  property: TSESTree.ObjectLiteralElement,
  keys: Set<string>,
  pending: (TSESTree.Node | undefined)[],
): void {
  if (property.type === AST_NODE_TYPES.SpreadElement) {
    pending.push(property.argument);
    return;
  }
  const name = propertyName(property);
  if (name !== undefined) {
    keys.add(name);
  }
}

function knownKeys(
  context: SourceContext,
  node: TSESTree.Node | undefined,
  seen = new Set<TSESTree.Node>(),
): Set<string> | undefined {
  const pending = [node];
  const keys = new Set<string>();
  for (const current of pending) {
    const resolved = resolveConstant(context, current);
    if (resolved?.type !== AST_NODE_TYPES.ObjectExpression || seen.has(resolved)) {
      return undefined;
    }
    seen.add(resolved);
    for (const property of resolved.properties) {
      recordKey(property, keys, pending);
    }
  }
  return keys;
}

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
        if (!isJsonStringify(node.callee)) {
          return;
        }
        const config = resolveConstant(context, node.arguments[0]);
        if (config?.type !== AST_NODE_TYPES.ObjectExpression) {
          return;
        }
        const compilerOptions = config.properties.find(
          (property): property is TSESTree.Property =>
            property.type === AST_NODE_TYPES.Property &&
            propertyName(property) === 'compilerOptions',
        );
        if (compilerOptions === undefined) {
          return;
        }
        const keys = knownKeys(context, compilerOptions.value);
        if (keys === undefined) {
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
