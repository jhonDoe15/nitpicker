import { findVariable, isFunctionNode } from '../analysis/constant-resolution.mjs';
import { constructedName, SEQUELIZE, TYPEORM } from '../database/orm-modules.mjs';
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
} from './timeout-options.mjs';

const TYPEORM_POSTGRES = new Set(['postgres', 'cockroachdb']);
const KNEX_POSTGRES = new Set(['pg', 'pg-native', 'postgres', 'postgresql', 'cockroachdb']);
const TYPEORM_KEYS = ['entities', 'autoLoadEntities', 'migrations', 'migrationsRun'];
const POSTGRES_URL = /^postgres(?:ql)?:/iu;

function keyText(context, options, key) {
  const value = valueOf(options, key);
  return value === undefined ? undefined : textOf(context, value);
}

function isSpreadSource(context, object) {
  const declarator = object.parent;
  if (declarator?.type !== 'VariableDeclarator' || declarator.id.type !== 'Identifier') {
    return false;
  }
  const variable = findVariable(context, declarator.id, declarator.id.name);
  return (variable?.references ?? []).some(
    (reference) => reference.identifier.parent?.type === 'SpreadElement',
  );
}

function knexState(context, options) {
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

function typeOrmState(context, options) {
  const url = valueOf(options, 'url');
  return either([
    nestedState(options, 'extra', postgresOptionsState),
    url === undefined ? MISSING : textState(context, url, MISSING),
  ]);
}

function ormKind(scope, options) {
  const { context } = scope;
  const isTypeOrm =
    scope.families.has(TYPEORM) || TYPEORM_KEYS.some((key) => valueOf(options, key) !== undefined);
  if (isTypeOrm && TYPEORM_POSTGRES.has(keyText(context, options, 'type'))) {
    return {
      name: 'TypeORM',
      judge: () => typeOrmState(context, options),
    };
  }
  if (scope.families.has(SEQUELIZE) && keyText(context, options, 'dialect') === 'postgres') {
    return {
      name: 'Sequelize',
      judge: () => nestedState(options, 'dialectOptions', postgresOptionsState),
    };
  }
  const isKnex = valueOf(options, 'connection') !== undefined;
  return isKnex && KNEX_POSTGRES.has(keyText(context, options, 'client'))
    ? { name: 'Knex', judge: () => knexState(context, options) }
    : undefined;
}

export function ormOptionsTimeout(scope, object) {
  const options = optionsOf(scope.context, object);
  const kind = options === undefined ? undefined : ormKind(scope, options);
  if (kind === undefined || isSpreadSource(scope.context, object)) {
    return undefined;
  }
  return { kind: 'database', name: kind.name, state: kind.judge() };
}

function sequelizeUrlState(context, args) {
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

export function sequelizeUrlTimeout(scope, node) {
  const isSequelize =
    node.type === 'NewExpression' &&
    scope.families.has(SEQUELIZE) &&
    constructedName(node) === 'Sequelize';
  const url = isSequelize ? textOf(scope.context, node.arguments[0]) : undefined;
  if (url === undefined || !POSTGRES_URL.test(url)) {
    return undefined;
  }
  const state = sequelizeUrlState(scope.context, node.arguments);
  return state === undefined ? undefined : { kind: 'database', name: 'Sequelize', state };
}
