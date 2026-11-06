import { libraryBinding, variableOf } from '../../../libraries/module-bindings.mjs';
import { constantInitializer } from '../analysis/ancestry.mjs';
import { staticKeyName } from '../analysis/static-shapes.mjs';

export const TYPEORM = 'TypeORM';
export const MIKRO_ORM = 'MikroORM';
export const SEQUELIZE = 'Sequelize';
const ORM_PACKAGES = new Map([
  [TYPEORM, ['typeorm']],
  [MIKRO_ORM, ['@mikro-orm']],
  [SEQUELIZE, ['sequelize', 'sequelize-typescript', '@sequelize/core']],
]);
const DECORATED_ORMS = [TYPEORM, MIKRO_ORM];

function bindingOf(sourceCode, identifier, orm) {
  return libraryBinding(variableOf(sourceCode, identifier), ORM_PACKAGES.get(orm));
}

export function importedName(sourceCode, node, orm) {
  if (node.type === 'Identifier') {
    const binding = bindingOf(sourceCode, node, orm);
    return binding === undefined ? undefined : (binding.name ?? node.name);
  }
  if (node.type !== 'MemberExpression' || node.object.type !== 'Identifier') {
    return undefined;
  }
  const binding = bindingOf(sourceCode, node.object, orm);
  return binding !== undefined && binding.name === undefined
    ? staticKeyName(node.property, node.computed)
    : undefined;
}

export function ormOf(sourceCode, callee, names) {
  for (const orm of DECORATED_ORMS) {
    const name = importedName(sourceCode, callee, orm);
    if (name !== undefined && names.has(name)) {
      return { orm, name };
    }
  }
  return undefined;
}

function isOrmSource(source, orm) {
  return ORM_PACKAGES.get(orm).some(
    (name) => source === name || (typeof source === 'string' && source.startsWith(`${name}/`)),
  );
}

function requiredSource(declarator) {
  const init = declarator.init;
  return init?.type === 'CallExpression' &&
    init.callee.type === 'Identifier' &&
    init.callee.name === 'require'
    ? init.arguments[0]?.value
    : undefined;
}

function statementSources(statement) {
  if (statement.type === 'ImportDeclaration') {
    return [statement.source.value];
  }
  return statement.type === 'VariableDeclaration'
    ? statement.declarations.map((declarator) => requiredSource(declarator))
    : [];
}

export function importsOrm(sourceCode, orm) {
  return sourceCode.ast.body
    .flatMap((statement) => statementSources(statement))
    .some((source) => isOrmSource(source, orm));
}

const TYPE_WRAPPERS = new Set([
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSNonNullExpression',
  'TSTypeAssertion',
]);

function unwrapped(node) {
  const chain = [node];
  for (const current of chain) {
    if (TYPE_WRAPPERS.has(current?.type)) {
      chain.push(current.expression);
    }
  }
  return chain.at(-1);
}

export function valueOf(sourceCode, expression) {
  const node = unwrapped(expression);
  return node?.type === 'Identifier'
    ? (unwrapped(constantInitializer(sourceCode, node)) ?? node)
    : node;
}

export function objectOf(sourceCode, expression) {
  const node = unwrapped(expression);
  if (node?.type === 'ObjectExpression') {
    return node;
  }
  if (node?.type === 'Identifier') {
    const value = unwrapped(constantInitializer(sourceCode, node));
    return value?.type === 'ObjectExpression' ? value : undefined;
  }
  return undefined;
}

function spreadProperties(sourceCode, property) {
  const spread = objectOf(sourceCode, property.argument);
  return (spread?.properties ?? []).filter((inner) => inner.type === 'Property');
}

export function propertiesOf(sourceCode, object) {
  const properties = (object?.properties ?? []).flatMap((property) =>
    property.type === 'SpreadElement' ? spreadProperties(sourceCode, property) : [property],
  );
  return new Map(
    properties
      .map((property) => [staticKeyName(property.key, property.computed), property])
      .filter(([key]) => key !== undefined),
  );
}
