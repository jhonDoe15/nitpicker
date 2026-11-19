import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { typeServices, type Context } from '../../../../rules/security/security-values.mts';
import { ts } from '../../../../rules/typed/typescript-views.mts';
import { isInvariant, mentions, plainChainRoot, type Repeated } from '../../loops/invariants.mts';
import type { LoopCall } from '../../loops/loop-call.mts';
import { keyColumn } from '../../orm/key-column.mts';
import type { OrmCall } from '../../orm/orm-call.mts';
import { spliced } from '../text.mts';

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

function propertiesOf(object: TSESTree.ObjectExpression): PlainProperty[] | undefined {
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
  const root = plainChainRoot(node);
  return root?.type === AST_NODE_TYPES.Identifier && root.name === item;
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

export type LookupPlan = {
  readonly callee: TSESTree.MemberExpression;
  readonly keyed: KeyedWhere | undefined;
  readonly kind: Lookup['kind'];
  readonly rename: string;
  readonly optionsFit: boolean;
  readonly keyText: (name: string, part: string) => string;
  readonly valueTypeOf: (site: Site, kind: Lookup['kind']) => string | undefined;
};

export function resolvedLookup(site: Site, plan: LookupPlan): Lookup | undefined {
  const { callee, keyed, kind, rename } = plan;
  const { context, call, orm } = site;
  const column = keyed === undefined ? undefined : keyColumn(context, orm, keyed.keyName);
  const unique = column?.primary === true || column?.unique === true;
  if (
    keyed === undefined ||
    column === undefined ||
    !plan.optionsFit ||
    !column.comparable ||
    (kind === 'row' && !unique) ||
    column.type !== scalarOf(site, keyed.keyExpression)
  ) {
    return undefined;
  }
  const { sourceCode } = context;
  return {
    orm,
    kind,
    keyName: keyed.keyName,
    keyExpression: keyed.keyExpression,
    keyType: column.type,
    valueType: plan.valueTypeOf(site, kind),
    callText: (part) =>
      spliced(sourceCode, call.range, [
        { range: callee.property.range, text: rename },
        { range: keyed.keyProperty.range, text: plan.keyText(keyed.keyName, part) },
      ]),
  };
}
