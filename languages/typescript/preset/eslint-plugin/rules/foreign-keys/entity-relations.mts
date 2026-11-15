import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import type { SourceCode } from '../typed/node-views.mts';
import { staticKeyName } from '../analysis/static-shapes.mts';
import { stringValue } from '../analysis/constant-resolution.mts';
import {
  MIKRO_ORM,
  TYPEORM,
  type DecoratedOrm,
  mergedProperties,
  objectOf,
  ormOf,
  propertiesOf,
  valueOf,
} from '../persistence/orm-bindings.mts';

type MaybeNode = TSESTree.Node | undefined;
type ClassNode = TSESTree.ClassDeclaration | TSESTree.ClassExpression;
type DecoratorUse = {
  readonly orm: DecoratedOrm;
  readonly name: string;
  readonly call: TSESTree.CallExpression;
};
type Relation = DecoratorUse & {
  readonly member: TSESTree.PropertyDefinition;
  readonly options: Map<string, TSESTree.Node>;
};
type Names = { has(name: string): boolean };

const RELATION = new Set(['ManyToOne']);
const PRIMARY = new Set(['PrimaryColumn', 'PrimaryGeneratedColumn', 'PrimaryKey']);
const VIEWS = new Set(['ViewEntity']);
const CLASS_INDEXES = new Set(['Index', 'Unique']);
const COLUMNS = new Set(['Column', 'Property']);
const JOIN_COLUMN = new Set(['JoinColumn']);
const NO_FOREIGN_KEY = new Map<DecoratedOrm, string>([
  [TYPEORM, 'createForeignKeyConstraints'],
  [MIKRO_ORM, 'createForeignKeyConstraint'],
]);
const MIKRO_COLUMN_KEYS = ['joinColumn', 'fieldName'];
const MIKRO_COLUMN_LISTS = ['joinColumns', 'fieldNames'];
const UPPER = /[A-Z]/gu;

function isPresent(value: string | undefined): value is string {
  return value !== undefined && value !== '';
}

function maybeValue(sourceCode: SourceCode, node: MaybeNode): MaybeNode {
  return node === undefined ? undefined : valueOf(sourceCode, node);
}

function decoratorsOf(sourceCode: SourceCode, node: TSESTree.Node, names: Names): DecoratorUse[] {
  const decorators = 'decorators' in node ? node.decorators : [];
  return decorators.flatMap((decorator) => {
    const call = decorator.expression;
    if (call.type !== AST_NODE_TYPES.CallExpression) {
      return [];
    }
    const found = ormOf(sourceCode, call.callee, names);
    return found === undefined ? [] : [{ ...found, call }];
  });
}

function optionsOf(
  sourceCode: SourceCode,
  call: TSESTree.CallExpression,
): Map<string, TSESTree.Node> {
  return new Map(
    [...mergedProperties(sourceCode, call.arguments)].map(([key, property]) => [
      key,
      valueOf(sourceCode, property.value),
    ]),
  );
}

function literalOf(value: MaybeNode): unknown {
  return value?.type === AST_NODE_TYPES.Literal ? value.value : undefined;
}

function firstString(sourceCode: SourceCode, value: MaybeNode): string | undefined {
  const outer = maybeValue(sourceCode, value);
  const node =
    outer?.type === AST_NODE_TYPES.ArrayExpression
      ? maybeValue(sourceCode, outer.elements[0] ?? undefined)
      : outer;
  if (node?.type === AST_NODE_TYPES.ObjectExpression) {
    return stringValue(maybeValue(sourceCode, propertiesOf(sourceCode, node).get('name')?.value));
  }
  return stringValue(node);
}

function firstMember(node: TSESTree.ArrowFunctionExpression): string | undefined {
  const body =
    node.body.type === AST_NODE_TYPES.ArrayExpression ? node.body.elements[0] : undefined;
  return body?.type === AST_NODE_TYPES.MemberExpression
    ? staticKeyName(body)
    : undefined;
}

function leadingColumn(sourceCode: SourceCode, call: TSESTree.CallExpression): string | undefined {
  for (const argument of call.arguments.map((node) => valueOf(sourceCode, node))) {
    if (argument.type === AST_NODE_TYPES.ArrayExpression) {
      return firstString(sourceCode, argument);
    }
    if (argument.type === AST_NODE_TYPES.ArrowFunctionExpression) {
      return firstMember(argument);
    }
    const properties =
      argument.type === AST_NODE_TYPES.ObjectExpression
        ? propertiesOf(sourceCode, argument)
        : undefined;
    const listed = properties?.get('properties');
    if (listed !== undefined) {
      return firstString(sourceCode, listed.value);
    }
  }
  return undefined;
}

function snakeCase(name: string): string {
  return name.replaceAll(UPPER, (letter) => `_${letter.toLowerCase()}`);
}

function joinColumnNames(sourceCode: SourceCode, relation: Relation): (string | undefined)[] {
  const { member } = relation;
  const name = staticKeyName(member);
  if (relation.orm === TYPEORM) {
    const joined = decoratorsOf(sourceCode, member, JOIN_COLUMN)[0]?.call.arguments[0];
    return [
      name,
      joined === undefined ? undefined : firstString(sourceCode, joined),
      `${String(name)}Id`,
    ];
  }
  const named = [...MIKRO_COLUMN_KEYS, ...MIKRO_COLUMN_LISTS].flatMap((key) => {
    const value = relation.options.get(key);
    return value === undefined ? [] : [firstString(sourceCode, value)];
  });
  return [name, ...named, `${snakeCase(String(name))}_id`];
}

function isPartial(sourceCode: SourceCode, call: TSESTree.CallExpression): boolean {
  return call.arguments.some((argument) =>
    propertiesOf(sourceCode, objectOf(sourceCode, argument)).has('where'),
  );
}

function isTruthy(value: MaybeNode): boolean {
  const literal = literalOf(value);
  return literal === true || (typeof literal === 'string' && literal.length > 0);
}

function columnOptions(sourceCode: SourceCode, member: TSESTree.Node): Map<string, TSESTree.Node> {
  const column =
    decoratorsOf(sourceCode, member, COLUMNS)[0] ?? decoratorsOf(sourceCode, member, RELATION)[0];
  return column === undefined
    ? new Map<string, TSESTree.Node>()
    : optionsOf(sourceCode, column.call);
}

function memberNames(sourceCode: SourceCode, member: TSESTree.ClassElement): string[] {
  const relation = relationOf(sourceCode, member);
  if (relation !== undefined) {
    return joinColumnNames(sourceCode, relation).filter(isPresent);
  }
  const options = columnOptions(sourceCode, member);
  const name = 'key' in member ? staticKeyName(member) : undefined;
  return [name, stringValue(options.get('name') ?? options.get('fieldName'))].filter(isPresent);
}

function isPrimary(sourceCode: SourceCode, member: TSESTree.ClassElement): boolean {
  return (
    decoratorsOf(sourceCode, member, PRIMARY).length > 0 ||
    literalOf(columnOptions(sourceCode, member).get('primary')) === true
  );
}

function isIndexedMember(sourceCode: SourceCode, member: TSESTree.ClassElement): boolean {
  const options = columnOptions(sourceCode, member);
  const indexes = decoratorsOf(sourceCode, member, CLASS_INDEXES);
  return (
    indexes.some(({ call }) => !isPartial(sourceCode, call)) ||
    isTruthy(options.get('index')) ||
    isTruthy(options.get('unique'))
  );
}

function sharesName(
  sourceCode: SourceCode,
  other: TSESTree.ClassElement,
  names: ReadonlySet<string>,
): boolean {
  return memberNames(sourceCode, other).some((name) => names.has(name));
}

function isCovered(
  sourceCode: SourceCode,
  { member, classNode }: { readonly member: TSESTree.ClassElement; readonly classNode: ClassNode },
): boolean {
  const names = new Set(memberNames(sourceCode, member));
  const members = classNode.body.body;
  const primary = members.find((other) => isPrimary(sourceCode, other));
  if (primary !== undefined && sharesName(sourceCode, primary, names)) {
    return true;
  }
  const leading = decoratorsOf(sourceCode, classNode, CLASS_INDEXES)
    .filter(({ call }) => !isPartial(sourceCode, call))
    .map(({ call }) => leadingColumn(sourceCode, call));
  return (
    leading.some((name) => name !== undefined && names.has(name)) ||
    members.some(
      (other) => sharesName(sourceCode, other, names) && isIndexedMember(sourceCode, other),
    )
  );
}

function relationOf(sourceCode: SourceCode, member: TSESTree.ClassElement): Relation | undefined {
  const found = decoratorsOf(sourceCode, member, RELATION)[0];
  if (found === undefined || member.type !== AST_NODE_TYPES.PropertyDefinition) {
    return undefined;
  }
  const options = optionsOf(sourceCode, found.call);
  const persisted = literalOf(options.get('persist')) !== false;
  const noForeignKey = NO_FOREIGN_KEY.get(found.orm);
  const constrained =
    (noForeignKey === undefined ? undefined : literalOf(options.get(noForeignKey))) !== false;
  return persisted && constrained ? { ...found, member, options } : undefined;
}

export function unindexedRelations(
  sourceCode: SourceCode,
  classNode: ClassNode,
): {
  readonly node: TSESTree.CallExpression;
  readonly orm: DecoratedOrm;
  readonly property: string;
}[] {
  if (decoratorsOf(sourceCode, classNode, VIEWS).length > 0) {
    return [];
  }
  return classNode.body.body.flatMap((member) => {
    const relation = relationOf(sourceCode, member);
    if (relation === undefined || isCovered(sourceCode, { member, classNode })) {
      return [];
    }
    const property = staticKeyName(relation.member);
    return property === undefined ? [] : [{ node: relation.call, orm: relation.orm, property }];
  });
}
