import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { staticKeyName } from '../analysis/static-shapes.mts';
import type { SourceCode } from '../typed/node-views.mts';
import {
  MIKRO_ORM,
  TYPEORM,
  type DecoratedOrm,
  importedName,
  importsOrm,
  mergedProperties,
  objectOf,
  ormOf,
  propertiesOf,
  valueOf,
} from './orm-bindings.mts';

export const MANY_TO_MANY = 'many-to-many';
const MANY_TO_ONE = 'many-to-one';
const ONE_TO_ONE = 'one-to-one';
const ONE_TO_MANY = 'one-to-many';
const EAGER = 'eager';

type RelationKind =
  typeof MANY_TO_ONE | typeof ONE_TO_ONE | typeof ONE_TO_MANY | typeof MANY_TO_MANY;
export type Cascade = { readonly node: TSESTree.Node; readonly values: TSESTree.Node[] };
export type Relation = {
  readonly orm: DecoratedOrm;
  readonly kind: RelationKind;
  readonly eager: TSESTree.Node | undefined;
  readonly cascade: Cascade | undefined;
};
type SchemaShape = { readonly container: string; readonly kindKeys: readonly string[] };
type Properties = Map<string, TSESTree.Property>;

const DECORATOR_KINDS = new Map<string, RelationKind>([
  ['ManyToOne', MANY_TO_ONE],
  ['OneToOne', ONE_TO_ONE],
  ['OneToMany', ONE_TO_MANY],
  ['ManyToMany', MANY_TO_MANY],
]);
const BUILDER_KINDS = new Map<string, RelationKind>([
  ['manyToOne', MANY_TO_ONE],
  ['oneToOne', ONE_TO_ONE],
  ['oneToMany', ONE_TO_MANY],
  ['manyToMany', MANY_TO_MANY],
]);
const SCHEMA_KINDS = new Map<string, RelationKind>([
  [MANY_TO_ONE, MANY_TO_ONE],
  [ONE_TO_ONE, ONE_TO_ONE],
  [ONE_TO_MANY, ONE_TO_MANY],
  [MANY_TO_MANY, MANY_TO_MANY],
  ['m:1', MANY_TO_ONE],
  ['1:1', ONE_TO_ONE],
  ['1:m', ONE_TO_MANY],
  ['m:n', MANY_TO_MANY],
  ['MANY_TO_ONE', MANY_TO_ONE],
  ['ONE_TO_ONE', ONE_TO_ONE],
  ['ONE_TO_MANY', ONE_TO_MANY],
  ['MANY_TO_MANY', MANY_TO_MANY],
]);
const SCHEMA_CLASS = new Set(['EntitySchema']);
const SCHEMA_RELATIONS = new Map<DecoratedOrm, SchemaShape>([
  [TYPEORM, { container: 'relations', kindKeys: ['type'] }],
  [MIKRO_ORM, { container: 'properties', kindKeys: ['kind', 'reference'] }],
]);
const BUILDER_OPTIONS = new Set<string | undefined>([EAGER, 'cascade']);

function cascadeValues(sourceCode: SourceCode, expression: TSESTree.Node): TSESTree.Node[] {
  const value = valueOf(sourceCode, expression);
  return value.type === AST_NODE_TYPES.ArrayExpression
    ? value.elements.flatMap((element) => (element === null ? [] : [valueOf(sourceCode, element)]))
    : [value];
}

function isTrue(sourceCode: SourceCode, expression: TSESTree.Node): boolean {
  const value = valueOf(sourceCode, expression);
  return value.type === AST_NODE_TYPES.Literal && value.value === true;
}

function fromProperties(
  sourceCode: SourceCode,
  { orm, kind }: { readonly orm: DecoratedOrm; readonly kind: RelationKind },
  properties: Properties,
): Relation {
  const eager = properties.get(EAGER);
  const cascade = properties.get('cascade');
  return {
    orm,
    kind,
    eager: eager !== undefined && isTrue(sourceCode, eager.value) ? eager : undefined,
    cascade:
      cascade === undefined
        ? undefined
        : { node: cascade, values: cascadeValues(sourceCode, cascade.value) },
  };
}

function decoratorRelation(sourceCode: SourceCode, call: TSESTree.CallExpression): Relation[] {
  const found = ormOf(sourceCode, call.callee, DECORATOR_KINDS);
  const kind = found === undefined ? undefined : DECORATOR_KINDS.get(found.name);
  if (found === undefined || kind === undefined) {
    return [];
  }
  return [
    fromProperties(
      sourceCode,
      { orm: found.orm, kind },
      mergedProperties(sourceCode, call.arguments),
    ),
  ];
}

function kindNamed(name: unknown): RelationKind | undefined {
  return typeof name === 'string' ? SCHEMA_KINDS.get(name) : undefined;
}

function schemaKind(value: TSESTree.Node): RelationKind | undefined {
  if (value.type === AST_NODE_TYPES.Literal) {
    return kindNamed(value.value);
  }
  if (value.type === AST_NODE_TYPES.TemplateLiteral && value.expressions.length === 0) {
    return kindNamed(value.quasis[0]?.value.cooked);
  }
  return value.type === AST_NODE_TYPES.MemberExpression
    ? kindNamed(staticKeyName(value))
    : undefined;
}

function schemaEntries(
  sourceCode: SourceCode,
  orm: DecoratedOrm,
  schema: TSESTree.Node | undefined,
): Relation[] {
  const shape = SCHEMA_RELATIONS.get(orm);
  if (shape === undefined) {
    return [];
  }
  const container = propertiesOf(sourceCode, objectOf(sourceCode, schema)).get(shape.container);
  const entries = propertiesOf(sourceCode, objectOf(sourceCode, container?.value));
  return [...entries.values()].flatMap((entry) => {
    const properties = propertiesOf(sourceCode, objectOf(sourceCode, entry.value));
    const kindProperty = shape.kindKeys
      .map((key) => properties.get(key))
      .find((property) => property !== undefined);
    const kind = kindProperty === undefined ? undefined : schemaKind(kindProperty.value);
    return kind === undefined ? [] : [fromProperties(sourceCode, { orm, kind }, properties)];
  });
}

function schemaRelations(sourceCode: SourceCode, expression: TSESTree.NewExpression): Relation[] {
  const found = ormOf(sourceCode, expression.callee, SCHEMA_CLASS);
  return found === undefined ? [] : schemaEntries(sourceCode, found.orm, expression.arguments[0]);
}

function memberCallName(call: TSESTree.Node): string | undefined {
  return call.type === AST_NODE_TYPES.CallExpression &&
    call.callee.type === AST_NODE_TYPES.MemberExpression
    ? staticKeyName(call.callee)
    : undefined;
}

function builderKind(call: TSESTree.MemberExpression): RelationKind | undefined {
  const chain: TSESTree.Node[] = [call.object];
  for (const current of chain) {
    const name = memberCallName(current);
    const kind = name === undefined ? undefined : BUILDER_KINDS.get(name);
    if (kind !== undefined) {
      return kind;
    }
    if (
      name !== undefined &&
      current.type === AST_NODE_TYPES.CallExpression &&
      current.callee.type === AST_NODE_TYPES.MemberExpression
    ) {
      chain.push(current.callee.object);
    }
  }
  return undefined;
}

function builderRelation(sourceCode: SourceCode, call: TSESTree.CallExpression): Relation[] {
  const option = memberCallName(call);
  if (
    call.callee.type !== AST_NODE_TYPES.MemberExpression ||
    !BUILDER_OPTIONS.has(option) ||
    !importsOrm(sourceCode, MIKRO_ORM)
  ) {
    return [];
  }
  const kind = builderKind(call.callee);
  if (kind === undefined) {
    return [];
  }
  const [first] = call.arguments;
  const node = call.callee.property;
  if (option === EAGER) {
    const eager = first === undefined || isTrue(sourceCode, first);
    return [{ orm: MIKRO_ORM, kind, eager: eager ? node : undefined, cascade: undefined }];
  }
  const values = call.arguments.flatMap((argument) => cascadeValues(sourceCode, argument));
  return [{ orm: MIKRO_ORM, kind, eager: undefined, cascade: { node, values } }];
}

export function relationsAt(
  sourceCode: SourceCode,
  node: TSESTree.CallExpression | TSESTree.NewExpression,
): Relation[] {
  if (node.type === AST_NODE_TYPES.NewExpression) {
    return schemaRelations(sourceCode, node);
  }
  return [...decoratorRelation(sourceCode, node), ...builderRelation(sourceCode, node)];
}

export function cascadeName(sourceCode: SourceCode, value: TSESTree.Node): string | undefined {
  if (value.type === AST_NODE_TYPES.Literal) {
    return value.value === true ? 'true' : String(value.value);
  }
  if (value.type !== AST_NODE_TYPES.MemberExpression) {
    return undefined;
  }
  return importedName(sourceCode, value.object, MIKRO_ORM) === 'Cascade'
    ? staticKeyName(value)?.toLowerCase()
    : undefined;
}
