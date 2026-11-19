import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { findVariable, type SourceContext } from '../analysis/constant-resolution.mts';

export type Call = TSESTree.NewExpression | TSESTree.CallExpression;

const { DefinitionType } = TSESLint.Scope;

export const INTL_PREFIX = 'Intl.';

export const INTL_TYPES: ReadonlySet<string> = new Set([
  'Collator',
  'DateTimeFormat',
  'DisplayNames',
  'DurationFormat',
  'ListFormat',
  'NumberFormat',
  'PluralRules',
  'RelativeTimeFormat',
  'Segmenter',
]);
const AJV_SOURCE = /^ajv(?:\/|$)/u;

export function globalName(context: SourceContext, node: TSESTree.Node, name: string): boolean {
  if (node.type !== AST_NODE_TYPES.Identifier || node.name !== name) {
    return false;
  }
  const variable = findVariable(context, node, name);
  return variable === undefined || variable.defs.length === 0;
}

function intlType(context: SourceContext, callee: TSESTree.Node): string | undefined {
  if (
    callee.type !== AST_NODE_TYPES.MemberExpression ||
    callee.computed ||
    callee.property.type !== AST_NODE_TYPES.Identifier
  ) {
    return undefined;
  }
  const owner = callee.object;
  const intl =
    globalName(context, owner, 'Intl') ||
    (owner.type === AST_NODE_TYPES.MemberExpression &&
      !owner.computed &&
      globalName(context, owner.object, 'globalThis') &&
      owner.property.name === 'Intl');
  return intl && INTL_TYPES.has(callee.property.name)
    ? `${INTL_PREFIX}${callee.property.name}`
    : undefined;
}

function ajvType(context: SourceContext, callee: TSESTree.Node): string | undefined {
  if (callee.type !== AST_NODE_TYPES.Identifier) {
    return undefined;
  }
  const definition = findVariable(context, callee, callee.name)?.defs.at(0);
  const source =
    definition?.type === DefinitionType.ImportBinding &&
    definition.parent.type === AST_NODE_TYPES.ImportDeclaration
      ? definition.parent.source.value
      : '';
  return AJV_SOURCE.test(source) ? callee.name : undefined;
}

export function sharedType(context: SourceContext, node: Call): string | undefined {
  if (node.type === AST_NODE_TYPES.NewExpression) {
    return intlType(context, node.callee) ?? ajvType(context, node.callee);
  }
  return intlType(context, node.callee);
}
