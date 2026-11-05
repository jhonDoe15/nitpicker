import { stringValue } from '../analysis/constant-resolution.mjs';
import {
  callName,
  leafValues,
  memberName,
  propertyNamed,
  resolvedValue,
  unwrapped,
} from '../security/security-values.mjs';
import {
  arrayTexts,
  DRIZZLE,
  hasKey,
  hasOpaqueSpread,
  isCondition,
  isEnvRead,
  isKnexShaped,
  isLiteral,
  isSequelizeShaped,
  isSwitchedOn,
  isTypeOrmShaped,
  MIKRO_ORM,
  objectOf,
  ormFamilies,
  propertyKey,
  SEQUELIZE,
  TYPEORM,
} from './orm-options.mjs';

const LOGGED_LEVELS = new Set(['query', 'all']);
const DEBUG_LEVELS = new Set(['query', 'query-params']);
const STRING_LEAVES = new Set(['Literal', 'TemplateLiteral']);

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

function prismaEntryLogs(context, element) {
  if (stringValue(resolvedValue(context, element)) === 'query') {
    return true;
  }
  const entry = objectOf(context, element);
  const textOf = (key) => {
    const value = entry === undefined ? undefined : propertyNamed(context, entry, key);
    return value === undefined ? undefined : stringValue(resolvedValue(context, value));
  };
  return textOf('level') === 'query' && textOf('emit') === 'stdout';
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

function isDrizzleOptions(object) {
  const call = object.parent;
  return (
    call?.type === 'CallExpression' &&
    call.arguments.includes(object) &&
    callName(call) === 'drizzle'
  );
}

export const rule = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow ORM options that log every SQL query' },
    schema: [],
    messages: {
      queryLogging:
        '`{{form}}` logs every SQL query: the logs fill with personal data and bound values, and every query pays for the log line. A value guarded by an environment check still logs in every other environment. Turn query logging off (`logging: false`) and log slow queries instead: TypeORM `maxQueryExecutionTime`, Sequelize `benchmark: true` with a logging function that keeps slow queries, Prisma `log: [{ emit: "event", level: "query" }]` with a handler that filters by duration, or the database\'s own slow-query log. An exception fits only for a local debugging script.',
    },
  },
  create(context) {
    const families = ormFamilies(context.sourceCode.ast);

    function report(node, form) {
      context.report({ node, messageId: 'queryLogging', data: { form } });
    }

    function isSequelizeOptions(object) {
      return families.has(SEQUELIZE) || isSequelizeShaped(context, object);
    }

    function isLoggingOptions(object) {
      return (
        families.has(TYPEORM) || isTypeOrmShaped(context, object) || isSequelizeOptions(object)
      );
    }

    function loggingOn(value) {
      return leafValues(context, value).some(
        (leaf) =>
          isLiteral(leaf, true) ||
          isLiteral(leaf, 'all') ||
          isCondition(leaf) ||
          isConsoleMethod(leaf) ||
          arrayTexts(context, leaf).some((text) => LOGGED_LEVELS.has(text)),
      );
    }

    function debugOn(value) {
      return (
        isSwitchedOn(context, value) ||
        leafValues(context, value).some((leaf) =>
          arrayTexts(context, leaf).some((text) => DEBUG_LEVELS.has(text)),
        )
      );
    }

    function prismaLogsQueries(value) {
      return leafValues(context, value).some((leaf) => {
        const array = resolvedValue(context, leaf);
        return (
          array?.type === 'ArrayExpression' &&
          array.elements.some((element) => element !== null && prismaEntryLogs(context, element))
        );
      });
    }

    const PROPERTY_CHECKS = {
      logging: (object, value) => isLoggingOptions(object) && loggingOn(value),
      logQueryParameters: (object, value) =>
        isSequelizeOptions(object) && isSwitchedOn(context, value),
      debug: (object, value) =>
        (families.has(MIKRO_ORM) || isKnexShaped(context, object)) && debugOn(value),
      log: (object, value) => isPrismaOptions(context, object) && prismaLogsQueries(value),
      logger: (object, value) =>
        families.has(DRIZZLE) && isDrizzleOptions(object) && isSwitchedOn(context, value),
    };

    function optionsArgument(args) {
      if (args.length === 3) {
        return { missing: true };
      }
      const last = args.at(-1);
      const object = last === undefined ? undefined : objectOf(context, last);
      if (object !== undefined) {
        return { object };
      }
      return { missing: args.length === 1 && isStringLike(context, last) };
    }

    function checkDefaultLogging(node, args, form) {
      const { object, missing } = optionsArgument(args);
      const silent =
        object === undefined
          ? !missing
          : hasKey(context, object, 'logging') || hasOpaqueSpread(context, object);
      if (!silent) {
        report(node, `${form}\` without \`logging: false`);
      }
    }

    return {
      Property(node) {
        const key = propertyKey(node);
        const check = key === undefined ? undefined : PROPERTY_CHECKS[key];
        if (check?.(node.parent, node.value) === true) {
          report(node, key);
        }
      },
      NewExpression(node) {
        if (families.has(SEQUELIZE) && callName(node) === 'Sequelize') {
          checkDefaultLogging(node, node.arguments, 'new Sequelize(...)');
        }
      },
      CallExpression(node) {
        const callee = unwrapped(node.callee);
        const isNestRoot =
          callee.type === 'MemberExpression' &&
          memberName(callee) === 'forRoot' &&
          callee.object.type === 'Identifier' &&
          callee.object.name === 'SequelizeModule';
        if (isNestRoot && node.arguments.length === 1) {
          checkDefaultLogging(node, node.arguments, 'SequelizeModule.forRoot(...)');
        }
      },
    };
  },
};
