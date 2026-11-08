import { depthFirst, objectChildren } from '../../../../../../shared/traversal.mjs';
import { isFunctionNode, stringValue } from '../analysis/constant-resolution.mjs';
import {
  isLiteral,
  leafValues,
  memberName,
  propertyNamed,
  resolvedValue,
  staticKey,
  unwrapped,
} from '../security/security-values.mjs';
import { calleeLabel, constructedName } from './orm-modules.mjs';

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
const KNEX_CLIENTS = new Set([
  'pg',
  'pg-native',
  'postgres',
  'postgresql',
  'mysql',
  'mysql2',
  'sqlite3',
  'better-sqlite3',
  'oracledb',
  'mssql',
  'tedious',
  'cockroachdb',
]);
const TYPEORM_KEYS = ['entities', 'autoLoadEntities', 'migrations', 'migrationsRun'];
const ORM_CALLS = new Set([
  'createConnection',
  'TypeOrmModule.forRoot',
  'SequelizeModule.forRoot',
  'MikroOrmModule.forRoot',
  'MikroORM.init',
  'defineConfig',
  'knex',
  'Knex',
]);
const ORM_CONSTRUCTORS = new Set(['DataSource', 'Sequelize']);
const ASYNC_ROOT = 'Module.forRootAsync';
const CONDITION_OPERATORS = new Set(['===', '!==', '==', '!=', '<', '<=', '>', '>=']);
const BRANCHES = new Set([
  'IfStatement',
  'ConditionalExpression',
  'LogicalExpression',
  'SwitchStatement',
]);

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

function isBooleanCast(node) {
  return (
    node.type === 'CallExpression' &&
    node.callee.type === 'Identifier' &&
    node.callee.name === 'Boolean'
  );
}

export function isCondition(leaf) {
  const target = unwrapped(leaf);
  return (
    (target.type === 'BinaryExpression' && CONDITION_OPERATORS.has(target.operator)) ||
    (target.type === 'UnaryExpression' && target.operator === '!') ||
    isBooleanCast(target) ||
    isEnvRead(target)
  );
}

export function isSwitchedOn(context, value) {
  return leafValues(context, value).some((leaf) => isLiteral(leaf, true) || isCondition(leaf));
}

export function isUnconditionalFunction(leaf) {
  if (!isFunctionNode(leaf)) {
    return false;
  }
  return ![...depthFirst(leaf.body, objectChildren)].some((node) => BRANCHES.has(node.type));
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

function textOf(context, object, key) {
  const value = propertyNamed(context, object, key);
  return value === undefined ? undefined : stringValue(resolvedValue(context, value));
}

function isTypeOrmShaped(context, object) {
  return (
    TYPEORM_KEYS.some((key) => hasKey(context, object, key)) ||
    TYPEORM_DRIVERS.has(textOf(context, object, 'type'))
  );
}

function isSequelizeShaped(context, object) {
  return hasKey(context, object, 'dialect');
}

function isKnexShaped(context, object) {
  return KNEX_CLIENTS.has(textOf(context, object, 'client'));
}

function isMikroOrmShaped(context, object) {
  return (
    hasKey(context, object, 'dbName') ||
    (hasKey(context, object, 'driver') && hasKey(context, object, 'entities'))
  );
}

function isOrmCallArgument(object) {
  const call = object.parent;
  if (call?.type !== 'CallExpression' && call?.type !== 'NewExpression') {
    return false;
  }
  if (!call.arguments.includes(object)) {
    return false;
  }
  return (
    ORM_CALLS.has(calleeLabel(call)) ||
    (call.type === 'NewExpression' && ORM_CONSTRUCTORS.has(constructedName(call)))
  );
}

function factoryOf(object) {
  const parent = object.parent;
  if (isFunctionNode(parent) && parent.body === object) {
    return parent;
  }
  const block = parent?.type === 'ReturnStatement' ? parent.parent : undefined;
  return block?.type === 'BlockStatement' && isFunctionNode(block.parent)
    ? block.parent
    : undefined;
}

export function factoryCall(object) {
  const property = factoryOf(object)?.parent;
  const isFactory = property?.type === 'Property' && staticKey(property) === 'useFactory';
  const call = isFactory ? property.parent.parent : undefined;
  return call?.type === 'CallExpression' && calleeLabel(call)?.endsWith(ASYNC_ROOT) === true
    ? call
    : undefined;
}

export function isOrmOptions(scope, object) {
  const { context } = scope;
  return (
    isTypeOrmShaped(context, object) ||
    isSequelizeShaped(context, object) ||
    isMikroOrmShaped(context, object) ||
    isKnexShaped(context, object) ||
    isOrmCallArgument(object) ||
    (scope.families.size > 0 && factoryCall(object) !== undefined)
  );
}

export function propertyKey(node) {
  return node.parent?.type === 'ObjectExpression' ? staticKey(node) : undefined;
}
