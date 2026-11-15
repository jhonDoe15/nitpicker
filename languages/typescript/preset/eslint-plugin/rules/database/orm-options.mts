import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { isFunctionNode, stringValue } from '../analysis/constant-resolution.mts';
import {
  isLiteral,
  leafValues,
  memberName,
  propertyNamed,
  resolvedValue,
  staticKey,
  unwrapped,
  type Context,
} from '../security/security-values.mts';
import { depthFirst, isNode, objectChildren } from '../typed/node-views.mts';
import { calleeLabel, constructedName, type ModuleScope } from './orm-modules.mts';

const TYPEORM_DRIVERS = new Set<string | undefined>([
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
const KNEX_CLIENTS = new Set<string | undefined>([
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
const ORM_CALLS = new Set<string | undefined>([
  'createConnection',
  'TypeOrmModule.forRoot',
  'SequelizeModule.forRoot',
  'MikroOrmModule.forRoot',
  'MikroORM.init',
  'defineConfig',
  'knex',
  'Knex',
]);
const ORM_CONSTRUCTORS = new Set<string | undefined>(['DataSource', 'Sequelize']);
const ASYNC_ROOT = 'Module.forRootAsync';
const CONDITION_OPERATORS = new Set(['===', '!==', '==', '!=', '<', '<=', '>', '>=']);
const BRANCHES = new Set<string>([
  AST_NODE_TYPES.IfStatement,
  AST_NODE_TYPES.ConditionalExpression,
  AST_NODE_TYPES.LogicalExpression,
  AST_NODE_TYPES.SwitchStatement,
]);

export function isEnvRead(node: TSESTree.Node): boolean {
  const target = unwrapped(node);
  const owner =
    target.type === AST_NODE_TYPES.MemberExpression ? unwrapped(target.object) : undefined;
  return (
    owner?.type === AST_NODE_TYPES.MemberExpression &&
    memberName(owner) === 'env' &&
    owner.object.type === AST_NODE_TYPES.Identifier &&
    owner.object.name === 'process'
  );
}

function isBooleanCast(node: TSESTree.Node): boolean {
  return (
    node.type === AST_NODE_TYPES.CallExpression &&
    node.callee.type === AST_NODE_TYPES.Identifier &&
    node.callee.name === 'Boolean'
  );
}

export function isTestExpression(leaf: TSESTree.Node, operators: ReadonlySet<string>): boolean {
  const target = unwrapped(leaf);
  return (
    (target.type === AST_NODE_TYPES.BinaryExpression && operators.has(target.operator)) ||
    (target.type === AST_NODE_TYPES.UnaryExpression && target.operator === '!') ||
    isEnvRead(target)
  );
}

export function isCondition(leaf: TSESTree.Node): boolean {
  return isTestExpression(leaf, CONDITION_OPERATORS) || isBooleanCast(unwrapped(leaf));
}

export function isSwitchedOn(context: Context, value: TSESTree.Node): boolean {
  return leafValues(context, value).some((leaf) => isLiteral(leaf, true) || isCondition(leaf));
}

export function isUnconditionalFunction(leaf: TSESTree.Node): boolean {
  if (!isFunctionNode(leaf)) {
    return false;
  }
  return ![...depthFirst<object>(leaf.body, objectChildren)].some(
    (node) => isNode(node) && BRANCHES.has(node.type),
  );
}

export function arrayTexts(context: Context, leaf: TSESTree.Node): (string | undefined)[] {
  const array = resolvedValue(context, leaf);
  if (array?.type !== AST_NODE_TYPES.ArrayExpression) {
    return [];
  }
  return array.elements.flatMap((element) =>
    element === null ? [] : leafValues(context, element).map((value) => stringValue(value)),
  );
}

export function objectOf(
  context: Context,
  node: TSESTree.Node | undefined,
): TSESTree.ObjectExpression | undefined {
  const object = resolvedValue(context, node);
  return object?.type === AST_NODE_TYPES.ObjectExpression ? object : undefined;
}

export function hasKey(context: Context, object: TSESTree.Node, key: string): boolean {
  return propertyNamed(context, object, key) !== undefined;
}

export function hasOpaqueSpread(context: Context, object: TSESTree.ObjectExpression): boolean {
  return object.properties.some(
    (entry) =>
      entry.type === AST_NODE_TYPES.SpreadElement &&
      objectOf(context, entry.argument) === undefined,
  );
}

export function textOf(context: Context, object: TSESTree.Node, key: string): string | undefined {
  const value = propertyNamed(context, object, key);
  return value === undefined ? undefined : stringValue(resolvedValue(context, value));
}

function isTypeOrmShaped(context: Context, object: TSESTree.Node): boolean {
  return (
    TYPEORM_KEYS.some((key) => hasKey(context, object, key)) ||
    TYPEORM_DRIVERS.has(textOf(context, object, 'type'))
  );
}

function isSequelizeShaped(context: Context, object: TSESTree.Node): boolean {
  return hasKey(context, object, 'dialect');
}

function isKnexShaped(context: Context, object: TSESTree.Node): boolean {
  return KNEX_CLIENTS.has(textOf(context, object, 'client'));
}

function isMikroOrmShaped(context: Context, object: TSESTree.Node): boolean {
  return (
    hasKey(context, object, 'dbName') ||
    (hasKey(context, object, 'driver') && hasKey(context, object, 'entities'))
  );
}

function isOrmCallArgument(object: TSESTree.ObjectExpression): boolean {
  const call = object.parent;
  if (call.type !== AST_NODE_TYPES.CallExpression && call.type !== AST_NODE_TYPES.NewExpression) {
    return false;
  }
  if (!call.arguments.includes(object)) {
    return false;
  }
  return (
    ORM_CALLS.has(calleeLabel(call)) ||
    (call.type === AST_NODE_TYPES.NewExpression && ORM_CONSTRUCTORS.has(constructedName(call)))
  );
}

function factoryOf(object: TSESTree.ObjectExpression): TSESTree.Node | undefined {
  const { parent } = object;
  if (isFunctionNode(parent) && parent.body === object) {
    return parent;
  }
  const block = parent.type === AST_NODE_TYPES.ReturnStatement ? parent.parent : undefined;
  return block?.type === AST_NODE_TYPES.BlockStatement && isFunctionNode(block.parent)
    ? block.parent
    : undefined;
}

export function factoryCall(
  object: TSESTree.ObjectExpression,
): TSESTree.CallExpression | undefined {
  const property = factoryOf(object)?.parent;
  const call =
    property?.type === AST_NODE_TYPES.Property && staticKey(property) === 'useFactory'
      ? property.parent.parent
      : undefined;
  return call?.type === AST_NODE_TYPES.CallExpression &&
    calleeLabel(call)?.endsWith(ASYNC_ROOT) === true
    ? call
    : undefined;
}

export function isOrmOptions(
  scope: Pick<ModuleScope, 'context' | 'families'>,
  object: TSESTree.ObjectExpression,
): boolean {
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

export function propertyKey(node: TSESTree.Node): string | undefined {
  return node.parent?.type === AST_NODE_TYPES.ObjectExpression ? staticKey(node) : undefined;
}
