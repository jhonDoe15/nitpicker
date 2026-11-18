import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { typeServices, type Context } from '../../../../rules/security/security-values.mts';
import { ts } from '../../../../rules/typed/typescript-views.mts';
import { isInvariant, mentions, type Repeated } from '../../loops/invariants.mts';
import type { LoopCall } from '../../loops/loop-call.mts';
import type { OrmCall } from '../../orm/orm-call.mts';

export type Scalar = 'string' | 'number';

export type Lookup = {
  readonly orm: OrmCall;
  readonly kind: 'row' | 'list';
  readonly keyName: string;
  readonly keyExpression: TSESTree.Expression;
  readonly keyType: Scalar;
  readonly valueType: string | undefined;
  readonly callText: (part: string) => string;
};

export type Site = {
  readonly context: Context;
  readonly call: TSESTree.CallExpression;
  readonly loop: LoopCall;
  readonly orm: OrmCall;
  readonly repeated: Repeated;
  readonly declarator: TSESTree.VariableDeclarator;
};

export type PlainProperty = TSESTree.Property & {
  readonly key: TSESTree.Identifier;
  readonly value: TSESTree.Expression;
};

export type KeyedWhere = {
  readonly keyProperty: PlainProperty;
  readonly keyName: string;
  readonly keyExpression: TSESTree.Expression;
};

export function plainProperty(node: TSESTree.Node): node is PlainProperty {
  return (
    node.type === AST_NODE_TYPES.Property &&
    node.kind === 'init' &&
    !node.computed &&
    !node.method &&
    node.key.type === AST_NODE_TYPES.Identifier &&
    node.value.type !== AST_NODE_TYPES.AssignmentPattern &&
    node.value.type !== AST_NODE_TYPES.TSEmptyBodyFunctionExpression
  );
}

export function propertiesOf(object: TSESTree.ObjectExpression): PlainProperty[] | undefined {
  const plain = object.properties.filter(plainProperty);
  return plain.length === object.properties.length ? plain : undefined;
}

export function valueOf(
  object: TSESTree.ObjectExpression,
  name: string,
): TSESTree.Node | undefined {
  const found = object.properties.find(
    (property) => plainProperty(property) && property.key.name === name,
  );
  return found?.type === AST_NODE_TYPES.Property ? found.value : undefined;
}

export function isItemChain(node: TSESTree.Node, item: string): node is TSESTree.Expression {
  if (node.type === AST_NODE_TYPES.Identifier) {
    return node.name === item;
  }
  return (
    node.type === AST_NODE_TYPES.MemberExpression &&
    !node.computed &&
    !node.optional &&
    node.property.type === AST_NODE_TYPES.Identifier &&
    isItemChain(node.object, item)
  );
}

export function scalarOf(site: Pick<Site, 'context'>, node: TSESTree.Node): Scalar | undefined {
  const services = typeServices(site.context);
  const type = services?.getTypeAtLocation(node);
  if (type === undefined) {
    return undefined;
  }
  if ((type.flags & ts.TypeFlags.String) !== 0) {
    return 'string';
  }
  return (type.flags & ts.TypeFlags.Number) !== 0 ? 'number' : undefined;
}

export function keyedWhere(
  site: Pick<Site, 'context' | 'loop' | 'repeated'>,
  where: TSESTree.Node | undefined,
): KeyedWhere | undefined {
  const properties =
    where?.type === AST_NODE_TYPES.ObjectExpression ? propertiesOf(where) : undefined;
  const { sourceCode } = site.context;
  const item = site.loop.item.name;
  const keyed = properties?.filter((property) => mentions(sourceCode, property.value, item));
  const [keyProperty] = keyed ?? [];
  if (
    properties === undefined ||
    keyed?.length !== 1 ||
    keyProperty === undefined ||
    !isItemChain(keyProperty.value, item)
  ) {
    return undefined;
  }
  const others = properties.filter((property) => property !== keyProperty);
  if (!others.every((property) => isInvariant(sourceCode, property.value, site.repeated))) {
    return undefined;
  }
  return {
    keyProperty,
    keyName: keyProperty.key.name,
    keyExpression: keyProperty.value,
  };
}

export function selectIncludes(select: TSESTree.Node | undefined, key: string): boolean {
  if (select === undefined) {
    return true;
  }
  if (select.type === AST_NODE_TYPES.ArrayExpression) {
    return select.elements.some(
      (element) => element?.type === AST_NODE_TYPES.Literal && element.value === key,
    );
  }
  return (
    select.type === AST_NODE_TYPES.ObjectExpression &&
    select.properties.some(
      (property) =>
        plainProperty(property) &&
        property.key.name === key &&
        property.value.type === AST_NODE_TYPES.Literal &&
        property.value.value === true,
    )
  );
}

export function optionsAllowed(
  site: Site,
  options: TSESTree.ObjectExpression,
  allowed: ReadonlySet<string>,
): boolean {
  const properties = propertiesOf(options);
  const { sourceCode } = site.context;
  return (
    properties !== undefined &&
    properties.every(
      (property) =>
        allowed.has(property.key.name) &&
        (property.key.name === 'where' || isInvariant(sourceCode, property.value, site.repeated)),
    )
  );
}
