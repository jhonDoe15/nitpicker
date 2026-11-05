import { stringValue } from '../analysis/constant-resolution.mjs';
import { loadedModule } from '../security/imported-names.mjs';
import {
  leafValues,
  memberName,
  propertyNamed,
  resolvedValue,
  staticKey,
  unwrapped,
} from '../security/security-values.mjs';

export const TYPEORM = 'typeorm';
export const SEQUELIZE = 'sequelize';
export const MIKRO_ORM = 'mikro-orm';
export const DRIZZLE = 'drizzle';

const FAMILIES = [
  [TYPEORM, (source) => source === 'typeorm' || source === '@nestjs/typeorm'],
  [
    SEQUELIZE,
    (source) => ['sequelize', 'sequelize-typescript', '@nestjs/sequelize'].includes(source),
  ],
  [MIKRO_ORM, (source) => source.startsWith('@mikro-orm/')],
  [DRIZZLE, (source) => source === 'drizzle-orm' || source.startsWith('drizzle-orm/')],
];
const TYPEORM_DRIVERS = new Set([
  'postgres',
  'mysql',
  'mariadb',
  'sqlite',
  'better-sqlite3',
  'mssql',
  'oracle',
  'cockroachdb',
  'sqljs',
  'mongodb',
  'aurora-mysql',
  'aurora-postgres',
  'sap',
  'spanner',
  'capacitor',
  'cordova',
  'expo',
  'nativescript',
  'react-native',
]);
const TYPEORM_KEYS = ['entities', 'autoLoadEntities', 'migrations', 'migrationsRun'];
const CONDITION_OPERATORS = new Set(['===', '!==', '==', '!=', '<', '<=', '>', '>=']);

function sourcesOf(statement) {
  if (statement.type === 'ImportDeclaration') {
    return [statement.source.value];
  }
  if (statement.type === 'TSImportEqualsDeclaration') {
    return [stringValue(statement.moduleReference?.expression)];
  }
  const declarations = statement.type === 'VariableDeclaration' ? statement.declarations : [];
  return declarations.map((declarator) => loadedModule(declarator.init));
}

export function isOrmModule(source) {
  return FAMILIES.some(([, matches]) => matches(source));
}

export function ormFamilies(program) {
  const sources = program.body.flatMap(sourcesOf).filter((source) => typeof source === 'string');
  return new Set(FAMILIES.filter(([, matches]) => sources.some(matches)).map(([family]) => family));
}

function localNames(statement) {
  if (statement.type === 'ImportDeclaration') {
    return statement.specifiers.map((specifier) => [specifier.local.name, statement.source.value]);
  }
  const declarations = statement.type === 'VariableDeclaration' ? statement.declarations : [];
  return declarations
    .filter((declarator) => declarator.id.type === 'Identifier')
    .map((declarator) => [declarator.id.name, loadedModule(declarator.init)]);
}

export function packageImports(program) {
  return new Map(
    program.body
      .flatMap(localNames)
      .filter(([, source]) => typeof source === 'string' && !source.startsWith('.')),
  );
}

export function rootName(node) {
  const target = unwrapped(node);
  if (target?.type === 'Identifier') {
    return target.name;
  }
  if (target?.type === 'MemberExpression') {
    return rootName(target.object);
  }
  return target?.type === 'CallExpression' ? rootName(target.callee) : undefined;
}

export function isLiteral(node, value) {
  return node?.type === 'Literal' && node.value === value;
}

export function isEnvRead(node) {
  const target = unwrapped(node);
  const owner = target?.type === 'MemberExpression' ? unwrapped(target.object) : undefined;
  return (
    owner?.type === 'MemberExpression' &&
    memberName(owner) === 'env' &&
    owner.object.type === 'Identifier' &&
    owner.object.name === 'process'
  );
}

export function isCondition(leaf) {
  const target = unwrapped(leaf);
  return (
    (target.type === 'BinaryExpression' && CONDITION_OPERATORS.has(target.operator)) ||
    (target.type === 'UnaryExpression' && target.operator === '!') ||
    isEnvRead(target)
  );
}

export function isSwitchedOn(context, value) {
  return leafValues(context, value).some((leaf) => isLiteral(leaf, true) || isCondition(leaf));
}

export function arrayTexts(context, leaf) {
  const array = resolvedValue(context, leaf);
  if (array?.type !== 'ArrayExpression') {
    return [];
  }
  return array.elements.flatMap((element) =>
    element === null ? [] : leafValues(context, element).map((value) => stringValue(value)),
  );
}

export function objectOf(context, node) {
  const object = resolvedValue(context, node);
  return object?.type === 'ObjectExpression' ? object : undefined;
}

export function hasKey(context, object, key) {
  return propertyNamed(context, object, key) !== undefined;
}

export function hasOpaqueSpread(context, object) {
  return object.properties.some(
    (entry) => entry.type === 'SpreadElement' && objectOf(context, entry.argument) === undefined,
  );
}

function isTypeOrmDriver(context, object) {
  const type = propertyNamed(context, object, 'type');
  return type !== undefined && TYPEORM_DRIVERS.has(stringValue(resolvedValue(context, type)));
}

export function isTypeOrmShaped(context, object) {
  return (
    TYPEORM_KEYS.some((key) => hasKey(context, object, key)) || isTypeOrmDriver(context, object)
  );
}

export function isSequelizeShaped(context, object) {
  return hasKey(context, object, 'dialect');
}

export function isKnexShaped(context, object) {
  return hasKey(context, object, 'client') && hasKey(context, object, 'connection');
}

export function propertyKey(node) {
  return node.parent?.type === 'ObjectExpression' ? staticKey(node) : undefined;
}

const FORM_LENGTH = 40;

export function callForm(context, receiver, method) {
  const text = context.sourceCode.getText(receiver);
  return text.length > FORM_LENGTH || text.includes('\n') ? `${method}()` : `${text}.${method}()`;
}
