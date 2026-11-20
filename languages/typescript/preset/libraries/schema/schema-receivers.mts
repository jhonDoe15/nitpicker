import type { TSESTree } from '@typescript-eslint/utils';
import type { SchemaContext, SourceCode } from '../typed/library-types.mts';
import { hasKind } from '../../syntax/kinds/node-kinds.mts';
import { initializer, libraryBinding, variableOf } from '../module-bindings.mts';
import { appendAll } from '../../../../../shared/lists/lists.mts';

export const IDENTIFIER = 'Identifier';
export const MEMBER_EXPRESSION = 'MemberExpression';
export const CALL_EXPRESSION = 'CallExpression';
export const SCHEMA_NAME = /schema|codec|validat|type|ajv|struct|parser/i;

export function methodNameOf(member: TSESTree.MemberExpression): string | undefined {
  if (member.computed) {
    return hasKind(member.property, 'Literal') && typeof member.property.value === 'string'
      ? member.property.value
      : undefined;
  }
  return hasKind(member.property, IDENTIFIER) ? member.property.name : undefined;
}

export function hasLibraryType(
  { services }: SchemaContext,
  node: TSESTree.Node,
  packages: readonly string[],
): boolean {
  const nodeMap = services?.esTreeNodeToTSNodeMap;
  if (services?.program === null || services?.program === undefined || nodeMap === undefined) {
    return false;
  }
  const type = services.program.getTypeChecker().getTypeAtLocation(nodeMap.get(node));
  const symbol = type.aliasSymbol ?? type.getSymbol();
  return (symbol?.declarations ?? []).some((declaration) =>
    packages.some((name) =>
      declaration.getSourceFile().fileName.includes(`/node_modules/${name}/`),
    ),
  );
}

function derivedParents(
  sourceCode: SourceCode,
  node: TSESTree.Node,
  packages: readonly string[],
): true | (TSESTree.Node | undefined)[] {
  if (hasKind(node, IDENTIFIER)) {
    const variable = variableOf(sourceCode, node);
    return libraryBinding(variable, packages) === undefined ? [initializer(variable)] : true;
  }
  if (hasKind(node, MEMBER_EXPRESSION)) {
    return [node.object];
  }
  if (hasKind(node, CALL_EXPRESSION) || hasKind(node, 'NewExpression')) {
    return [node.callee];
  }
  return hasKind(node, 'AwaitExpression') ? [node.argument] : [];
}

function firstVisit(
  seen: Set<TSESTree.Node>,
  node: TSESTree.Node | undefined,
): node is TSESTree.Node {
  if (node === undefined || seen.has(node)) {
    return false;
  }
  seen.add(node);
  return true;
}

export function isDerived(
  { sourceCode }: SchemaContext,
  start: TSESTree.Node | undefined,
  packages: readonly string[],
): boolean {
  const pending: (TSESTree.Node | undefined)[] = [start];
  const seen = new Set<TSESTree.Node>();
  for (const node of pending) {
    if (!firstVisit(seen, node)) {
      continue;
    }
    const parents = derivedParents(sourceCode, node, packages);
    if (parents === true) {
      return true;
    }
    appendAll(pending, parents);
  }
  return false;
}

export function looksLikeSchema(
  ctx: SchemaContext,
  receiver: TSESTree.Node,
  packages: readonly string[],
): boolean {
  return (
    SCHEMA_NAME.test(ctx.sourceCode.getText(receiver)) || hasLibraryType(ctx, receiver, packages)
  );
}

export function isNamespaceReceiver(
  { sourceCode }: SchemaContext,
  receiver: TSESTree.Node,
  packages: readonly string[],
): boolean {
  return (
    hasKind(receiver, IDENTIFIER) &&
    libraryBinding(variableOf(sourceCode, receiver), packages) !== undefined
  );
}
