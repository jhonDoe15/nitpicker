import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { staticKeyName } from '../analysis/static-shapes.mts';
import { constantInitializer, type SourceCode } from '../typed/node-views.mts';
import { ASSERTION_WRAPPERS, unwrapOf } from '../typed/syntax-views.mts';
import { libraryBinding, variableOf, type LibraryBinding } from './library-bindings.mts';

export const TYPEORM = 'TypeORM';
export const MIKRO_ORM = 'MikroORM';
export const SEQUELIZE = 'Sequelize';
export type DecoratedOrm = typeof TYPEORM | typeof MIKRO_ORM;
export type Orm = DecoratedOrm | typeof SEQUELIZE;
type MaybeNode = TSESTree.Node | undefined;

const ORM_PACKAGES = new Map<Orm, readonly string[]>([
  [TYPEORM, ['typeorm']],
  [MIKRO_ORM, ['@mikro-orm']],
  [SEQUELIZE, ['sequelize', 'sequelize-typescript', '@sequelize/core']],
]);
const DECORATED_ORMS: readonly DecoratedOrm[] = [TYPEORM, MIKRO_ORM];

function bindingOf(
  sourceCode: SourceCode,
  identifier: TSESTree.Identifier,
  orm: Orm,
): LibraryBinding | undefined {
  return libraryBinding(variableOf(sourceCode, identifier), ORM_PACKAGES.get(orm) ?? []);
}

export function importedName(
  sourceCode: SourceCode,
  node: TSESTree.Node,
  orm: Orm,
): string | undefined {
  if (node.type === AST_NODE_TYPES.Identifier) {
    const binding = bindingOf(sourceCode, node, orm);
    return binding === undefined ? undefined : (binding.name ?? node.name);
  }
  if (
    node.type !== AST_NODE_TYPES.MemberExpression ||
    node.object.type !== AST_NODE_TYPES.Identifier
  ) {
    return undefined;
  }
  const binding = bindingOf(sourceCode, node.object, orm);
  return binding !== undefined && binding.name === undefined ? staticKeyName(node) : undefined;
}

export function ormOf(
  sourceCode: SourceCode,
  callee: TSESTree.Node,
  names: { has(name: string): boolean },
): { readonly orm: DecoratedOrm; readonly name: string } | undefined {
  for (const orm of DECORATED_ORMS) {
    const name = importedName(sourceCode, callee, orm);
    if (name !== undefined && names.has(name)) {
      return { orm, name };
    }
  }
  return undefined;
}

function isOrmSource(source: unknown, orm: Orm): boolean {
  return (ORM_PACKAGES.get(orm) ?? []).some(
    (name) => source === name || (typeof source === 'string' && source.startsWith(`${name}/`)),
  );
}

function requiredSource(declarator: TSESTree.VariableDeclarator): unknown {
  const { init } = declarator;
  if (
    init?.type !== AST_NODE_TYPES.CallExpression ||
    init.callee.type !== AST_NODE_TYPES.Identifier ||
    init.callee.name !== 'require'
  ) {
    return undefined;
  }
  const [first] = init.arguments;
  return first?.type === AST_NODE_TYPES.Literal ? first.value : undefined;
}

function statementSources(statement: TSESTree.Node): unknown[] {
  if (statement.type === AST_NODE_TYPES.ImportDeclaration) {
    return [statement.source.value];
  }
  return statement.type === AST_NODE_TYPES.VariableDeclaration
    ? statement.declarations.map((declarator) => requiredSource(declarator))
    : [];
}

export function importsOrm(sourceCode: SourceCode, orm: Orm): boolean {
  return sourceCode.ast.body
    .flatMap((statement) => statementSources(statement))
    .some((source) => isOrmSource(source, orm));
}

export function valueOf(sourceCode: SourceCode, expression: TSESTree.Node): TSESTree.Node {
  const node = unwrapOf(expression, ASSERTION_WRAPPERS);
  return node.type === AST_NODE_TYPES.Identifier
    ? (unwrapOf(constantInitializer(sourceCode, node), ASSERTION_WRAPPERS) ?? node)
    : node;
}

export function maybeValue(sourceCode: SourceCode, node: MaybeNode): MaybeNode {
  return node === undefined ? undefined : valueOf(sourceCode, node);
}

export function objectOf(
  sourceCode: SourceCode,
  expression: MaybeNode,
): TSESTree.ObjectExpression | undefined {
  const node = unwrapOf(expression, ASSERTION_WRAPPERS);
  if (node?.type === AST_NODE_TYPES.ObjectExpression) {
    return node;
  }
  if (node?.type === AST_NODE_TYPES.Identifier) {
    const value = unwrapOf(constantInitializer(sourceCode, node), ASSERTION_WRAPPERS);
    return value?.type === AST_NODE_TYPES.ObjectExpression ? value : undefined;
  }
  return undefined;
}

function spreadProperties(
  sourceCode: SourceCode,
  property: TSESTree.SpreadElement,
): TSESTree.Property[] {
  const spread = objectOf(sourceCode, property.argument);
  return (spread?.properties ?? []).filter((inner) => inner.type === AST_NODE_TYPES.Property);
}

export function propertiesOf(
  sourceCode: SourceCode,
  object: TSESTree.ObjectExpression | undefined,
): Map<string, TSESTree.Property> {
  const properties = (object?.properties ?? []).flatMap((property) =>
    property.type === AST_NODE_TYPES.SpreadElement
      ? spreadProperties(sourceCode, property)
      : [property],
  );
  return new Map(
    properties.flatMap((property): [string, TSESTree.Property][] => {
      const key = staticKeyName(property);
      return key === undefined ? [] : [[key, property]];
    }),
  );
}

export function mergedProperties(
  sourceCode: SourceCode,
  argumentsList: readonly TSESTree.Node[],
): Map<string, TSESTree.Property> {
  return new Map(
    argumentsList.flatMap((argument) => [
      ...propertiesOf(sourceCode, objectOf(sourceCode, argument)),
    ]),
  );
}
