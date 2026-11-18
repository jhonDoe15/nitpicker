import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import {
  DRIZZLE,
  MIKRO_ORM,
  ormFamilyOf,
  SEQUELIZE,
  TYPEORM,
  type ModuleScope,
} from '../../rules/database/orm-modules.mts';
import { factoryCall, isEnvRead } from '../../rules/database/orm-options.mts';
import { unwrapped } from '../../rules/security/security-values.mts';
import { depthFirst, nodeChildren } from '../../rules/typed/node-views.mts';
import { appendingArgument } from '../support/calls.mts';
import { addingProperty, isPlainObject, keyName } from '../support/objects.mts';
import { hasCommentIn, replacing, type FixPlan } from '../support/ranges.mts';
import {
  mikroDebug,
  prismaLog,
  sequelizeLogging,
  switchedOff,
  typeormLogging,
} from './logging-values.mts';
import { boundFamily, optionsFamily, PRISMA } from './orm-call-sites.mts';

const LOGGING_OFF = 'logging: false';
const POSITIONAL_ARITY = 3;

function isDefaultLogger(scope: ModuleScope, value: TSESTree.Node): boolean {
  const binding =
    value.type === AST_NODE_TYPES.NewExpression && value.callee.type === AST_NODE_TYPES.Identifier
      ? scope.bindings.get(value.callee.name)
      : undefined;
  return (
    value.type === AST_NODE_TYPES.NewExpression &&
    value.arguments.length === 0 &&
    binding?.imported === 'DefaultLogger' &&
    ormFamilyOf(binding.source) === DRIZZLE
  );
}

function drizzleLogger(scope: ModuleScope, value: TSESTree.Node): FixPlan | undefined {
  const quiet =
    (value.type === AST_NODE_TYPES.Literal && value.value === true) ||
    isDefaultLogger(scope, value);
  return quiet && !hasCommentIn(scope.context.sourceCode, value.range)
    ? replacing(value.range, 'false')
    : undefined;
}

function byFamily(
  scope: ModuleScope,
  { family, key, value }: { family: string; key: string; value: TSESTree.Node },
): FixPlan | undefined {
  const { context } = scope;
  if (key === 'logging') {
    if (family === TYPEORM) {
      return typeormLogging(context, value);
    }
    return family === SEQUELIZE ? sequelizeLogging(context, value) : undefined;
  }
  if (key === 'logQueryParameters') {
    return family === TYPEORM || family === SEQUELIZE ? switchedOff(context, value) : undefined;
  }
  if (key === 'debug') {
    return family === MIKRO_ORM ? mikroDebug(context, value) : undefined;
  }
  if (key === 'log') {
    return family === PRISMA ? prismaLog(context, value) : undefined;
  }
  return key === 'logger' && family === DRIZZLE ? drizzleLogger(scope, value) : undefined;
}

export function propertyFix(scope: ModuleScope, property: TSESTree.Property): FixPlan | undefined {
  const object = property.parent;
  const key = keyName(property);
  if (
    object.type !== AST_NODE_TYPES.ObjectExpression ||
    key === undefined ||
    !isPlainObject(object) ||
    property.shorthand ||
    property.method
  ) {
    return undefined;
  }
  const family = optionsFamily(scope, object);
  return family === undefined ? undefined : byFamily(scope, { family, key, value: property.value });
}

function isStringArgument(node: TSESTree.Node): boolean {
  return (
    (node.type === AST_NODE_TYPES.Literal && typeof node.value === 'string') ||
    node.type === AST_NODE_TYPES.TemplateLiteral ||
    isEnvRead(node)
  );
}

function sequelizeArguments(
  scope: ModuleScope,
  call: TSESTree.CallExpression | TSESTree.NewExpression,
): FixPlan | undefined {
  const { sourceCode } = scope.context;
  const last = call.arguments.at(-1);
  if (call.arguments.length === POSITIONAL_ARITY) {
    return appendingArgument(sourceCode, call, `{ ${LOGGING_OFF} }`);
  }
  if (last?.type === AST_NODE_TYPES.ObjectExpression) {
    return isPlainObject(last) ? addingProperty(sourceCode, last, LOGGING_OFF) : undefined;
  }
  return call.arguments.length === 1 && last !== undefined && isStringArgument(last)
    ? appendingArgument(sourceCode, call, `{ ${LOGGING_OFF} }`)
    : undefined;
}

export function constructionFix(
  scope: ModuleScope,
  call: TSESTree.CallExpression | TSESTree.NewExpression,
): FixPlan | undefined {
  const callee = unwrapped(call.callee);
  const isRoot =
    call.type === AST_NODE_TYPES.CallExpression &&
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.property.type === AST_NODE_TYPES.Identifier &&
    callee.property.name === 'forRoot';
  const isConstructor = call.type === AST_NODE_TYPES.NewExpression;
  if (boundFamily(scope, callee) !== SEQUELIZE || !(isRoot || isConstructor)) {
    return undefined;
  }
  return sequelizeArguments(scope, call);
}

function returnCount(fn: TSESTree.Node): number {
  return [...depthFirst<TSESTree.Node>(fn, nodeChildren)].filter(
    (node) => node.type === AST_NODE_TYPES.ReturnStatement,
  ).length;
}

export function factoryFix(
  scope: ModuleScope,
  object: TSESTree.ObjectExpression,
): FixPlan | undefined {
  const call = factoryCall(object);
  const fn =
    object.parent.type === AST_NODE_TYPES.ReturnStatement
      ? object.parent.parent?.parent
      : undefined;
  const single = fn === undefined || returnCount(fn) === 1;
  if (call === undefined || !single || boundFamily(scope, call.callee) !== SEQUELIZE) {
    return undefined;
  }
  return isPlainObject(object)
    ? addingProperty(scope.context.sourceCode, object, LOGGING_OFF)
    : undefined;
}
