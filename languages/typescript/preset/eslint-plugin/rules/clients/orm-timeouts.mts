import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { findVariable, isFunctionNode } from '../analysis/constant-resolution.mts';
import { constructedName, SEQUELIZE, TYPEORM, type ModuleScope } from '../database/orm-modules.mts';
import type { Context } from '../security/security-values.mts';
import {
  either,
  MISSING,
  nestedState,
  optionsOf,
  postgresOptionsState,
  SET,
  carriesTimeout,
  textOf,
  textState,
  UNKNOWN,
  valueOf,
  type State,
  type Timeout,
  type TimeoutOptions,
} from './timeout-options.mts';

type Kind = { readonly name: string; readonly judge: () => State };

const POSTGRES = 'postgres';
const SEQUELIZE_CLASS = 'Sequelize';
const TYPEORM_POSTGRES = new Set([POSTGRES, 'cockroachdb']);
const KNEX_POSTGRES = new Set(['pg', 'pg-native', POSTGRES, 'postgresql', 'cockroachdb']);
const TYPEORM_KEYS = ['entities', 'autoLoadEntities', 'migrations', 'migrationsRun'];
const POSTGRES_URL = /^postgres(?:ql)?:/iu;

function keyText(context: Context, options: TimeoutOptions, key: string): string | undefined {
  const value = valueOf(options, key);
  return value === undefined ? undefined : textOf(context, value);
}

function isIn(set: ReadonlySet<string>, value: string | undefined): boolean {
  return value !== undefined && set.has(value);
}

function isSpreadSource(context: Context, object: TSESTree.Node): boolean {
  const declarator = object.parent;
  if (
    declarator?.type !== AST_NODE_TYPES.VariableDeclarator ||
    declarator.id.type !== AST_NODE_TYPES.Identifier
  ) {
    return false;
  }
  const variable = findVariable(context, declarator.id, declarator.id.name);
  return (variable?.references ?? []).some(
    (reference) => reference.identifier.parent.type === AST_NODE_TYPES.SpreadElement,
  );
}

function knexState(context: Context, options: TimeoutOptions): State {
  const pool = optionsOf(context, valueOf(options, 'pool'));
  const hook = pool === undefined ? undefined : valueOf(pool, 'afterCreate');
  const connection = nestedState(options, 'connection', postgresOptionsState);
  if (hook === undefined) {
    return connection;
  }
  if (carriesTimeout(context.sourceCode.getText(hook))) {
    return SET;
  }
  return isFunctionNode(hook) ? connection : either([UNKNOWN, connection]);
}

function typeOrmState(context: Context, options: TimeoutOptions): State {
  const url = valueOf(options, 'url');
  return either([
    nestedState(options, 'extra', postgresOptionsState),
    url === undefined ? MISSING : textState(context, url, MISSING),
  ]);
}

function ormKind(scope: ModuleScope, options: TimeoutOptions): Kind | undefined {
  const { context } = scope;
  const isTypeOrm =
    scope.families.has(TYPEORM) || TYPEORM_KEYS.some((key) => valueOf(options, key) !== undefined);
  if (isTypeOrm && isIn(TYPEORM_POSTGRES, keyText(context, options, 'type'))) {
    return {
      name: 'TypeORM',
      judge: () => typeOrmState(context, options),
    };
  }
  if (scope.families.has(SEQUELIZE) && keyText(context, options, 'dialect') === POSTGRES) {
    return {
      name: SEQUELIZE_CLASS,
      judge: () => nestedState(options, 'dialectOptions', postgresOptionsState),
    };
  }
  const isKnex = valueOf(options, 'connection') !== undefined;
  return isKnex && isIn(KNEX_POSTGRES, keyText(context, options, 'client'))
    ? { name: 'Knex', judge: () => knexState(context, options) }
    : undefined;
}

export function ormOptionsTimeout(
  scope: ModuleScope,
  object: TSESTree.ObjectExpression,
): Timeout | undefined {
  const options = optionsOf(scope.context, object);
  const kind = options === undefined ? undefined : ormKind(scope, options);
  if (kind === undefined || isSpreadSource(scope.context, object)) {
    return undefined;
  }
  return { kind: 'database', name: kind.name, state: kind.judge() };
}

function sequelizeUrlState(
  context: Context,
  args: readonly TSESTree.CallExpressionArgument[],
): State | undefined {
  const settings = args.length > 1 ? optionsOf(context, args.at(-1)) : undefined;
  if (args.length > 1 && settings === undefined) {
    return UNKNOWN;
  }
  if (settings !== undefined && valueOf(settings, 'dialect') !== undefined) {
    return undefined;
  }
  return either([
    textState(context, args[0], MISSING),
    settings === undefined
      ? MISSING
      : nestedState(settings, 'dialectOptions', postgresOptionsState),
  ]);
}

export function sequelizeUrlTimeout(
  scope: ModuleScope,
  node: TSESTree.CallExpression | TSESTree.NewExpression,
): Timeout | undefined {
  const isSequelize =
    node.type === AST_NODE_TYPES.NewExpression &&
    scope.families.has(SEQUELIZE) &&
    constructedName(node) === SEQUELIZE_CLASS;
  const url = isSequelize ? textOf(scope.context, node.arguments[0]) : undefined;
  if (url === undefined || !POSTGRES_URL.test(url)) {
    return undefined;
  }
  const state = sequelizeUrlState(scope.context, node.arguments);
  return state === undefined ? undefined : { kind: 'database', name: SEQUELIZE_CLASS, state };
}
