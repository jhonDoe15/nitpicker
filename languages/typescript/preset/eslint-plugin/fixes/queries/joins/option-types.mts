import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import type TypeScript from 'typescript';
import { staticKey, typeServices, type Context } from '../../../rules/security/security-values.mts';
import { ts } from '../../../rules/typed/typescript-views.mts';
import { isPlainObject, keyName } from '../../support/objects.mts';

export function optionAccepts(
  context: Context,
  options: TSESTree.ObjectExpression,
  { key, literal }: { readonly key: string; readonly literal: string },
): boolean {
  const services = typeServices(context);
  if (services === undefined) {
    return false;
  }
  const checker = services.program.getTypeChecker();
  const node = services.esTreeNodeToTSNodeMap.get(options);
  const contextual = ts.isObjectLiteralExpression(node)
    ? checker.getContextualType(node)
    : undefined;
  const property =
    contextual === undefined
      ? undefined
      : checker.getPropertyOfType(checker.getNonNullableType(contextual), key);
  if (property === undefined) {
    return false;
  }
  const type = checker.getTypeOfSymbolAtLocation(property, node);
  const accepts: unknown = Reflect.get(checker, 'isTypeAssignableTo');
  const literalType: unknown = Reflect.get(checker, 'getStringLiteralType');
  if (typeof accepts !== 'function' || typeof literalType !== 'function') {
    return true;
  }
  return Boolean(
    Reflect.apply(accepts, checker, [Reflect.apply(literalType, checker, [literal]), type]),
  );
}

export function hasOnlyKeys(
  options: TSESTree.ObjectExpression,
  allowed: ReadonlySet<string>,
): boolean {
  return (
    isPlainObject(options) &&
    options.properties.every((property) => allowed.has(keyName(property) ?? ''))
  );
}

function topLevelKeys(node: TSESTree.Node): string[] | undefined {
  const entries: readonly TSESTree.Node[] =
    node.type === AST_NODE_TYPES.ArrayExpression
      ? node.elements.filter((element) => element !== null)
      : [node];
  const objects = entries.filter((entry) => entry.type === AST_NODE_TYPES.ObjectExpression);
  if (objects.length !== entries.length || !objects.every((entry) => isPlainObject(entry))) {
    return undefined;
  }
  return objects
    .flatMap((entry) =>
      entry.properties.map((property) =>
        property.type === AST_NODE_TYPES.Property ? staticKey(property) : undefined,
      ),
    )
    .filter((key) => key !== undefined);
}

export function avoidsRelations(
  node: TSESTree.Node | undefined,
  relations: ReadonlySet<string>,
): boolean {
  if (node === undefined) {
    return true;
  }
  const keys = topLevelKeys(node);
  return keys !== undefined && keys.every((key) => !relations.has(key) && !key.startsWith('$'));
}

function isEagerOption(argument: TypeScript.Node): boolean {
  return (
    ts.isObjectLiteralExpression(argument) &&
    argument.properties.some(
      (property) =>
        ts.isPropertyAssignment(property) &&
        property.name.getText() === 'eager' &&
        property.initializer.kind !== ts.SyntaxKind.FalseKeyword,
    )
  );
}

function hasEagerDecorator(member: TypeScript.ClassElement): boolean {
  const decorators = ts.canHaveDecorators(member) ? (ts.getDecorators(member) ?? []) : [];
  return decorators.some(
    ({ expression }) => ts.isCallExpression(expression) && expression.arguments.some(isEagerOption),
  );
}

export function isEagerType(type: TypeScript.Type | undefined): boolean {
  const declarations = type?.getSymbol()?.declarations ?? [];
  return declarations.some(
    (declaration) => ts.isClassLike(declaration) && declaration.members.some(hasEagerDecorator),
  );
}
