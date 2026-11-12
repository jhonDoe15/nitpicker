import { stringValue } from '../analysis/constant-resolution.mjs';
import {
  callName,
  isLiteral,
  leafValues,
  propertyNamed,
  resolvedValue,
} from '../security/security-values.mjs';
import {
  calleeLabel,
  constructedName,
  DRIZZLE,
  moduleScope,
  ormLocals,
  SEQUELIZE,
} from './orm-modules.mjs';
import {
  arrayTexts,
  factoryCall,
  hasKey,
  hasOpaqueSpread,
  isCondition,
  isEnvRead,
  isOrmOptions,
  isSwitchedOn,
  isUnconditionalFunction,
  objectOf,
  propertyKey,
} from './orm-options.mjs';

const LOGGED_LEVELS = new Set(['query', 'all']);
const DEBUG_LEVELS = new Set(['query', 'query-params']);
const STRING_LEAVES = new Set(['Literal', 'TemplateLiteral']);
const POSITIONAL_ONLY_ARITY = 3;
const NEST_ROOT = 'SequelizeModule.forRoot';
const NEST_ASYNC_ROOT = 'SequelizeModule.forRootAsync';
const DRIZZLE_LOGGERS = new Set(['DefaultLogger']);

function report(context, node, form) {
  context.report({ node, messageId: 'queryLogging', data: { form } });
}

function isConsoleMethod(leaf) {
  return (
    leaf.type === 'MemberExpression' &&
    leaf.object.type === 'Identifier' &&
    leaf.object.name === 'console'
  );
}

function isStringLike(context, node) {
  const leaves = leafValues(context, node);
  return (
    leaves.length > 0 && leaves.every((leaf) => STRING_LEAVES.has(leaf.type) || isEnvRead(leaf))
  );
}

function entryText(context, entry, key) {
  const value = propertyNamed(context, entry, key);
  return value === undefined ? undefined : stringValue(resolvedValue(context, value));
}

function prismaEntryLogs(context, element) {
  if (stringValue(resolvedValue(context, element)) === 'query') {
    return true;
  }
  const entry = objectOf(context, element);
  if (entry === undefined || entryText(context, entry, 'level') !== 'query') {
    return false;
  }
  const emit = entryText(context, entry, 'emit');
  return emit === 'stdout' || !hasKey(context, entry, 'emit');
}

function isClassExtending(context, node, name) {
  const owner = context.sourceCode
    .getAncestors(node)
    .findLast(
      (ancestor) => ancestor.type === 'ClassDeclaration' || ancestor.type === 'ClassExpression',
    );
  return owner?.superClass?.type === 'Identifier' && owner.superClass.name === name;
}

function isPrismaOptions(context, object) {
  const call = object.parent;
  if (call?.type === 'NewExpression' && call.arguments[0] === object) {
    return callName(call) === 'PrismaClient';
  }
  return (
    call?.type === 'CallExpression' &&
    call.callee.type === 'Super' &&
    call.arguments[0] === object &&
    isClassExtending(context, call, 'PrismaClient')
  );
}

function isDrizzleOptions(scope, object) {
  const call = object.parent;
  const names = ormLocals(scope, 'drizzle').add('drizzle');
  return (
    scope.families.has(DRIZZLE) &&
    call?.type === 'CallExpression' &&
    call.arguments.includes(object) &&
    names.has(constructedName(call))
  );
}

function loggingOn(context, value) {
  return leafValues(context, value).some(
    (leaf) =>
      isLiteral(leaf, true) ||
      isLiteral(leaf, 'all') ||
      isCondition(leaf) ||
      isConsoleMethod(leaf) ||
      isUnconditionalFunction(leaf) ||
      arrayTexts(context, leaf).some((text) => LOGGED_LEVELS.has(text)),
  );
}

function debugOn(context, value) {
  return (
    isSwitchedOn(context, value) ||
    leafValues(context, value).some((leaf) =>
      arrayTexts(context, leaf).some((text) => DEBUG_LEVELS.has(text)),
    )
  );
}

function prismaLogsQueries(context, value) {
  return leafValues(context, value).some((leaf) => {
    const array = resolvedValue(context, leaf);
    return (
      array?.type === 'ArrayExpression' &&
      array.elements.some((element) => element !== null && prismaEntryLogs(context, element))
    );
  });
}

function drizzleLogs(context, value) {
  return (
    isSwitchedOn(context, value) ||
    leafValues(context, value).some(
      (leaf) => leaf.type === 'NewExpression' && DRIZZLE_LOGGERS.has(constructedName(leaf)),
    )
  );
}

const PROPERTY_CHECKS = {
  logging: (scope, object, value) => isOrmOptions(scope, object) && loggingOn(scope.context, value),
  logQueryParameters: (scope, object, value) =>
    isOrmOptions(scope, object) && isSwitchedOn(scope.context, value),
  debug: (scope, object, value) => isOrmOptions(scope, object) && debugOn(scope.context, value),
  log: (scope, object, value) =>
    isPrismaOptions(scope.context, object) && prismaLogsQueries(scope.context, value),
  logger: (scope, object, value) =>
    isDrizzleOptions(scope, object) && drizzleLogs(scope.context, value),
};

function optionsArgument(context, args) {
  if (args.length === POSITIONAL_ONLY_ARITY) {
    return { missing: true };
  }
  const last = args.at(-1);
  const object = last === undefined ? undefined : objectOf(context, last);
  if (object !== undefined) {
    return { object };
  }
  return { missing: args.length === 1 && isStringLike(context, last) };
}

function logsByDefault(context, object) {
  return !hasKey(context, object, 'logging') && !hasOpaqueSpread(context, object);
}

function checkDefaultLogging({ context }, node, form) {
  const { object, missing } = optionsArgument(context, node.arguments);
  const logs = object === undefined ? missing : logsByDefault(context, object);
  if (logs) {
    report(context, node, `${form}\` without \`logging: false`);
  }
}

function isSequelizeConstruction(scope, node) {
  const names = ormLocals(scope, 'Sequelize').add('Sequelize');
  return scope.families.has(SEQUELIZE) && names.has(constructedName(node));
}

function checkFactoryResult(scope, object) {
  const call = factoryCall(object);
  if (call !== undefined && calleeLabel(call) === NEST_ASYNC_ROOT) {
    if (logsByDefault(scope.context, object)) {
      report(scope.context, object, `${NEST_ASYNC_ROOT}(...)\` without \`logging: false`);
    }
  }
}

export const rule = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow ORM options that log every SQL query' },
    schema: [],
    messages: {
      queryLogging:
        '`{{form}}` logs every SQL query: the logs fill with personal data and bound values, and every query pays for the log line. A value guarded by an environment check still logs in every other environment. Turn query logging off (`logging: false`) and log slow queries instead: TypeORM `maxQueryExecutionTime`, Sequelize `benchmark: true` with a logging function that keeps only slow queries, Prisma `log: [{ emit: "event", level: "query" }]` with a handler that filters by duration, or the database\'s own slow-query log. An exception fits only for a local debugging script.',
    },
  },
  create(context) {
    const scope = moduleScope(context);
    return {
      Property(node) {
        const key = propertyKey(node);
        const check = key === undefined ? undefined : PROPERTY_CHECKS[key];
        if (check?.(scope, node.parent, node.value) === true) {
          report(context, node, key);
        }
      },
      ObjectExpression(node) {
        checkFactoryResult(scope, node);
      },
      NewExpression(node) {
        if (isSequelizeConstruction(scope, node)) {
          checkDefaultLogging(scope, node, 'new Sequelize(...)');
        }
      },
      CallExpression(node) {
        if (calleeLabel(node) === NEST_ROOT && node.arguments.length === 1) {
          checkDefaultLogging(scope, node, `${NEST_ROOT}(...)`);
        }
      },
    };
  },
};
