import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { type SourceContext } from '../analysis/constant-resolution.mts';
import { staticKey, unwrapped } from '../security/security-values.mts';
import { calleeNameOf, resolvedThrough } from '../typed/syntax-views.mts';
import {
  isTempPath,
  mentionsTsconfig,
  serializedConfig,
  VALUE_WRAPPERS,
} from './temp-tsconfig.mts';

type MessageId = 'missingTypeRoots';

const WRITE_CALLS = new Set(['writeFileSync', 'writeFile']);
const TSCONFIG_KEYS = new Set(['compilerOptions', 'files', 'include', 'exclude', 'references']);

const MESSAGE =
  'TypeScript derives default `typeRoots` (`node_modules/@types`) from the location of the ' +
  'written config rather than the extended config, so writing an extending tsconfig into a ' +
  "temp folder drops the project's `@types` packages unless `compilerOptions.typeRoots` is " +
  'carried explicitly (or `compilerOptions.types` is set to `[]`).';

function hasSpread(object: TSESTree.ObjectExpression): boolean {
  return object.properties.some((property) => property.type === AST_NODE_TYPES.SpreadElement);
}

function propertyByKey(
  object: TSESTree.ObjectExpression,
  key: string,
): TSESTree.Property | undefined {
  return object.properties.findLast(
    (property): property is TSESTree.Property =>
      property.type === AST_NODE_TYPES.Property && staticKey(property) === key,
  );
}

function isUndefinedNode(node: TSESTree.Node): boolean {
  const value = unwrapped(node);
  return (
    (value.type === AST_NODE_TYPES.Identifier && value.name === 'undefined') ||
    (value.type === AST_NODE_TYPES.UnaryExpression && value.operator === 'void')
  );
}

function hasTsconfigKey(object: TSESTree.ObjectExpression): boolean {
  return object.properties.some(
    (property) =>
      property.type === AST_NODE_TYPES.Property && TSCONFIG_KEYS.has(staticKey(property) ?? ''),
  );
}

function isExtendingTsconfig(
  context: SourceContext,
  config: TSESTree.ObjectExpression,
  pathArg: TSESTree.Node,
): boolean {
  const extendsProp = propertyByKey(config, 'extends');
  if (extendsProp === undefined || isUndefinedNode(extendsProp.value)) {
    return false;
  }
  return (
    hasTsconfigKey(config) ||
    mentionsTsconfig(context, pathArg) ||
    mentionsTsconfig(context, extendsProp.value)
  );
}

function disablesTypesLookup(context: SourceContext, options: TSESTree.ObjectExpression): boolean {
  const typesProp = propertyByKey(options, 'types');
  if (typesProp === undefined) {
    return false;
  }
  const value = resolvedThrough(context, typesProp.value, VALUE_WRAPPERS);
  return value?.type === AST_NODE_TYPES.ArrayExpression && value.elements.length === 0;
}

function compilerOptionsNeedTypeRoots(context: SourceContext, optionsNode: TSESTree.Node): boolean {
  const resolved = resolvedThrough(context, optionsNode, VALUE_WRAPPERS);
  if (resolved?.type !== AST_NODE_TYPES.ObjectExpression) {
    return false;
  }
  if (hasSpread(resolved) || propertyByKey(resolved, 'typeRoots') !== undefined) {
    return false;
  }
  return !disablesTypesLookup(context, resolved);
}

function isMissingTypeRoots(context: SourceContext, config: TSESTree.ObjectExpression): boolean {
  if (hasSpread(config) || propertyByKey(config, 'typeRoots') !== undefined) {
    return false;
  }
  const compilerOptions = propertyByKey(config, 'compilerOptions');
  if (compilerOptions === undefined) {
    return true;
  }
  return compilerOptionsNeedTypeRoots(context, compilerOptions.value);
}

function isWriteCall(node: TSESTree.CallExpression): boolean {
  const callee = calleeNameOf(unwrapped(node.callee));
  return callee !== undefined && WRITE_CALLS.has(callee);
}

export const rule: TSESLint.RuleModule<MessageId> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require carrying `compilerOptions.typeRoots` when writing an extending tsconfig to a temp directory',
    },
    schema: [],
    messages: {
      missingTypeRoots: MESSAGE,
    },
  },
  create(context) {
    return {
      CallExpression(node: TSESTree.CallExpression) {
        if (!isWriteCall(node)) {
          return;
        }
        const [pathArg, contentArg] = node.arguments;
        if (
          pathArg === undefined ||
          contentArg === undefined ||
          pathArg.type === AST_NODE_TYPES.SpreadElement ||
          contentArg.type === AST_NODE_TYPES.SpreadElement
        ) {
          return;
        }
        const config = serializedConfig(context, contentArg);
        if (
          config !== undefined &&
          isExtendingTsconfig(context, config, pathArg) &&
          isMissingTypeRoots(context, config) &&
          isTempPath(context, pathArg)
        ) {
          context.report({ node, messageId: 'missingTypeRoots' });
        }
      },
    };
  },
};
