import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { stringValue } from '../analysis/constant-resolution.mts';
import {
  callName,
  isLiteral,
  leafValues,
  propertyNamed,
  resolvedValue,
  type Context,
} from '../security/security-values.mts';
import {
  calleeLabel,
  constructedName,
  DRIZZLE,
  moduleScope,
  ormLocals,
  SEQUELIZE,
  type ModuleScope,
} from './orm-modules.mts';
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
} from './orm-options.mts';

const QUERY_LEVEL = 'query';
const LOGGED_LEVELS = new Set<string | undefined>([QUERY_LEVEL, 'all']);
const DEBUG_LEVELS = new Set<string | undefined>([QUERY_LEVEL, 'query-params']);
const STRING_LEAVES = new Set<string>([AST_NODE_TYPES.Literal, AST_NODE_TYPES.TemplateLiteral]);
const POSITIONAL_ONLY_ARITY = 3;
const NEST_ROOT = 'SequelizeModule.forRoot';
const NEST_ASYNC_ROOT = 'SequelizeModule.forRootAsync';
const DRIZZLE_LOGGERS = new Set<string | undefined>(['DefaultLogger']);

function report(context: Context, node: TSESTree.Node, form: string): void {
  context.report({ node, messageId: 'queryLogging', data: { form } });
}

function isConsoleMethod(leaf: TSESTree.Node): boolean {
  return (
    leaf.type === AST_NODE_TYPES.MemberExpression &&
    leaf.object.type === AST_NODE_TYPES.Identifier &&
    leaf.object.name === 'console'
  );
}

function isStringLike(context: Context, node: TSESTree.Node | undefined): boolean {
  const leaves = leafValues(context, node);
  return (
    leaves.length > 0 && leaves.every((leaf) => STRING_LEAVES.has(leaf.type) || isEnvRead(leaf))
  );
}

function entryText(context: Context, entry: TSESTree.Node, key: string): string | undefined {
  const value = propertyNamed(context, entry, key);
  return value === undefined ? undefined : stringValue(resolvedValue(context, value));
}

function prismaEntryLogs(context: Context, element: TSESTree.Node): boolean {
  if (stringValue(resolvedValue(context, element)) === QUERY_LEVEL) {
    return true;
  }
  const entry = objectOf(context, element);
  if (entry === undefined || entryText(context, entry, 'level') !== QUERY_LEVEL) {
    return false;
  }
  const emit = entryText(context, entry, 'emit');
  return emit === 'stdout' || !hasKey(context, entry, 'emit');
}

function isClassExtending(context: Context, node: TSESTree.Node, name: string): boolean {
  const owner = context.sourceCode
    .getAncestors(node)
    .filter(
      (ancestor) =>
        ancestor.type === AST_NODE_TYPES.ClassDeclaration ||
        ancestor.type === AST_NODE_TYPES.ClassExpression,
    )
    .at(-1);
  return owner?.superClass?.type === AST_NODE_TYPES.Identifier && owner.superClass.name === name;
}

function isPrismaOptions(context: Context, object: TSESTree.ObjectExpression): boolean {
  const call = object.parent;
  if (call.type === AST_NODE_TYPES.NewExpression && call.arguments[0] === object) {
    return callName(call) === 'PrismaClient';
  }
  return (
    call.type === AST_NODE_TYPES.CallExpression &&
    call.callee.type === AST_NODE_TYPES.Super &&
    call.arguments[0] === object &&
    isClassExtending(context, call, 'PrismaClient')
  );
}

function isDrizzleOptions(scope: ModuleScope, object: TSESTree.ObjectExpression): boolean {
  const call = object.parent;
  const names = ormLocals(scope, 'drizzle').add('drizzle');
  return (
    scope.families.has(DRIZZLE) &&
    call.type === AST_NODE_TYPES.CallExpression &&
    call.arguments.includes(object) &&
    names.has(constructedName(call))
  );
}

function loggingOn(context: Context, value: TSESTree.Node): boolean {
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

function debugOn(context: Context, value: TSESTree.Node): boolean {
  return (
    isSwitchedOn(context, value) ||
    leafValues(context, value).some((leaf) =>
      arrayTexts(context, leaf).some((text) => DEBUG_LEVELS.has(text)),
    )
  );
}

function prismaLogsQueries(context: Context, value: TSESTree.Node): boolean {
  return leafValues(context, value).some((leaf) => {
    const array = resolvedValue(context, leaf);
    return (
      array?.type === AST_NODE_TYPES.ArrayExpression &&
      array.elements.some((element) => element !== null && prismaEntryLogs(context, element))
    );
  });
}

function drizzleLogs(context: Context, value: TSESTree.Node): boolean {
  return (
    isSwitchedOn(context, value) ||
    leafValues(context, value).some(
      (leaf) =>
        leaf.type === AST_NODE_TYPES.NewExpression && DRIZZLE_LOGGERS.has(constructedName(leaf)),
    )
  );
}

type PropertyCheck = (
  scope: ModuleScope,
  object: TSESTree.ObjectExpression,
  value: TSESTree.Node,
) => boolean;

const PROPERTY_CHECKS: Readonly<Record<string, PropertyCheck>> = {
  logging: (scope, object, value) => isOrmOptions(scope, object) && loggingOn(scope.context, value),
  logQueryParameters: (scope, object, value) =>
    isOrmOptions(scope, object) && isSwitchedOn(scope.context, value),
  debug: (scope, object, value) => isOrmOptions(scope, object) && debugOn(scope.context, value),
  log: (scope, object, value) =>
    isPrismaOptions(scope.context, object) && prismaLogsQueries(scope.context, value),
  logger: (scope, object, value) =>
    isDrizzleOptions(scope, object) && drizzleLogs(scope.context, value),
};

function optionsArgument(
  context: Context,
  args: readonly TSESTree.CallExpressionArgument[],
): { readonly object: TSESTree.ObjectExpression | undefined; readonly missing: boolean } {
  if (args.length === POSITIONAL_ONLY_ARITY) {
    return { object: undefined, missing: true };
  }
  const last = args.at(-1);
  const object = last === undefined ? undefined : objectOf(context, last);
  if (object !== undefined) {
    return { object, missing: false };
  }
  return { object: undefined, missing: args.length === 1 && isStringLike(context, last) };
}

function logsByDefault(context: Context, object: TSESTree.ObjectExpression): boolean {
  return !(hasKey(context, object, 'logging') || hasOpaqueSpread(context, object));
}

function checkDefaultLogging(
  { context }: ModuleScope,
  node: TSESTree.CallExpression | TSESTree.NewExpression,
  form: string,
): void {
  const { object, missing } = optionsArgument(context, node.arguments);
  const logs = object === undefined ? missing : logsByDefault(context, object);
  if (logs) {
    report(context, node, `${form}\` without \`logging: false`);
  }
}

function isSequelizeConstruction(scope: ModuleScope, node: TSESTree.NewExpression): boolean {
  const names = ormLocals(scope, 'Sequelize').add('Sequelize');
  return scope.families.has(SEQUELIZE) && names.has(constructedName(node));
}

function checkFactoryResult(scope: ModuleScope, object: TSESTree.ObjectExpression): void {
  const call = factoryCall(object);
  if (
    call !== undefined &&
    calleeLabel(call) === NEST_ASYNC_ROOT &&
    logsByDefault(scope.context, object)
  ) {
    report(scope.context, object, `${NEST_ASYNC_ROOT}(...)\` without \`logging: false`);
  }
}

export const rule: TSESLint.RuleModule<'queryLogging'> = {
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
        const { parent } = node;
        if (key === undefined || parent.type !== AST_NODE_TYPES.ObjectExpression) {
          return;
        }
        if (PROPERTY_CHECKS[key]?.(scope, parent, node.value) === true) {
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
