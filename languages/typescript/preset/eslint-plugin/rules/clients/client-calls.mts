import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import {
  calleeLabel,
  constructedName,
  type ModuleScope,
  type OrmBinding,
} from '../database/orm-modules.mts';
import { findVariable, stringValue } from '../analysis/constant-resolution.mts';
import { nameOf } from '../typed/node-views.mts';
import {
  memberName,
  resolvedValue,
  staticKey,
  unwrapped,
  type Context,
} from '../security/security-values.mts';
import {
  either,
  keyState,
  MISSING,
  nestedState,
  optionsOf,
  postgresOptionsState,
  textState,
  UNKNOWN,
  type State,
  type Timeout,
} from './timeout-options.mts';

type Made = OrmBinding & { readonly name: string | undefined };
type Call = TSESTree.CallExpression | TSESTree.NewExpression;

const { DefinitionType } = TSESLint.Scope;

const AWS_MODULE = /^@aws-sdk\/client-/u;
const PG_MODULES = new Set(['pg', 'pg-pool']);
const PG_CLASSES = new Set(['Pool', 'Client']);
const MODULE_SCOPES = new Set(['module', 'global']);
const CLASS_NAME = /^[A-Z]/u;
const NOT_CLIENT = /(?:Command|Exception|Input|Output)$/u;
const HANDLERS = new Set(['NodeHttpHandler', 'NodeHttp2Handler', 'FetchHttpHandler']);

function moduleBinding(scope: ModuleScope, target: TSESTree.Identifier): OrmBinding | undefined {
  const variable = findVariable(scope.context, target, target.name);
  const definition = variable?.defs[0];
  if (variable === undefined || !MODULE_SCOPES.has(variable.scope.type)) {
    return undefined;
  }
  const declarator = definition?.type === DefinitionType.Variable ? definition.node : undefined;
  const pattern = declarator?.id;
  const init = unwrapped(declarator?.init ?? undefined);
  const namespace =
    pattern?.type === AST_NODE_TYPES.ObjectPattern && init?.type === AST_NODE_TYPES.Identifier
      ? scope.bindings.get(init.name)
      : undefined;
  if (pattern?.type === AST_NODE_TYPES.ObjectPattern && namespace?.imported === '*') {
    const property = pattern.properties.find(
      (entry) => entry.type === AST_NODE_TYPES.Property && nameOf(entry.value) === target.name,
    );
    return {
      source: namespace.source,
      imported: property === undefined ? undefined : staticKey(property),
    };
  }
  return scope.bindings.get(target.name);
}

function bindingOf(scope: ModuleScope, node: TSESTree.Node): OrmBinding | undefined {
  const target = unwrapped(node);
  return target.type === AST_NODE_TYPES.Identifier ? moduleBinding(scope, target) : undefined;
}

function namespaceOwner(scope: ModuleScope, node: TSESTree.Node): OrmBinding | undefined {
  const target = unwrapped(node);
  const owner =
    target.type === AST_NODE_TYPES.MemberExpression && memberName(target) === 'native'
      ? target.object
      : target;
  return bindingOf(scope, owner);
}

function constructed(scope: ModuleScope, callee: TSESTree.Node): Made | undefined {
  const target = unwrapped(callee);
  if (target.type === AST_NODE_TYPES.Identifier) {
    const binding = bindingOf(scope, target);
    return binding === undefined ? undefined : { ...binding, name: binding.imported };
  }
  if (target.type !== AST_NODE_TYPES.MemberExpression) {
    return undefined;
  }
  const owner = namespaceOwner(scope, target.object);
  return owner?.imported === '*' ? { ...owner, name: memberName(target) } : undefined;
}

function isAwsClient(made: Made): boolean {
  return (
    AWS_MODULE.test(made.source) &&
    CLASS_NAME.test(made.name ?? '') &&
    !NOT_CLIENT.test(made.name ?? '')
  );
}

function listensOnConnect(context: Context, node: Call): boolean {
  const declarator = node.parent;
  if (
    declarator.type !== AST_NODE_TYPES.VariableDeclarator ||
    declarator.id.type !== AST_NODE_TYPES.Identifier
  ) {
    return false;
  }
  const variable = findVariable(context, declarator.id, declarator.id.name);
  return (variable?.references ?? []).some((reference) => {
    const member = reference.identifier.parent;
    const call = member.parent;
    return (
      member.type === AST_NODE_TYPES.MemberExpression &&
      memberName(member) === 'on' &&
      call?.type === AST_NODE_TYPES.CallExpression &&
      stringValue(call.arguments[0]) === 'connect'
    );
  });
}

function isPgClient(made: Made): boolean {
  if (made.source === 'pg-pool') {
    return made.name === '*';
  }
  return PG_MODULES.has(made.source) && made.name !== undefined && PG_CLASSES.has(made.name);
}

function isHandlerName(name: string | undefined): boolean {
  return name !== undefined && HANDLERS.has(name);
}

function handlerState(context: Context, node: TSESTree.Node): State {
  const value = resolvedValue(context, node);
  if (value?.type === AST_NODE_TYPES.ObjectExpression) {
    return requestTimeoutState(context, value);
  }
  const isHandler =
    (value?.type === AST_NODE_TYPES.NewExpression && isHandlerName(constructedName(value))) ||
    (value?.type === AST_NODE_TYPES.CallExpression &&
      isHandlerName(calleeLabel(value)?.split('.')[0]) &&
      constructedName(value) === 'create');
  if (!isHandler) {
    return UNKNOWN;
  }
  return value.arguments.length === 0 ? MISSING : requestTimeoutState(context, value.arguments[0]);
}

function requestTimeoutState(context: Context, node: TSESTree.Node | undefined): State {
  const options = optionsOf(context, node);
  return options === undefined
    ? UNKNOWN
    : either([keyState(options, 'requestTimeout'), keyState(options, 'socketTimeout')]);
}

function awsState(context: Context, config: TSESTree.Node | undefined): State {
  if (config === undefined) {
    return MISSING;
  }
  const options = optionsOf(context, config);
  return options === undefined ? UNKNOWN : nestedState(options, 'requestHandler', handlerState);
}

function connectionState(context: Context, node: TSESTree.Node): State {
  const options = optionsOf(context, node);
  return options === undefined ? UNKNOWN : keyState(options, 'statement_timeout');
}

function postgresJsState(
  context: Context,
  args: readonly TSESTree.CallExpressionArgument[],
): State {
  const first = optionsOf(context, args[0]);
  const url = first === undefined ? args[0] : undefined;
  const settings = first === undefined ? optionsOf(context, args[1]) : first;
  const urlState = url === undefined ? MISSING : textState(context, url, MISSING);
  if (settings === undefined) {
    return args.length > 1 && first === undefined ? either([urlState, UNKNOWN]) : urlState;
  }
  return either([urlState, nestedState(settings, 'connection', connectionState)]);
}

export function clientTimeout(scope: ModuleScope, node: Call): Timeout | undefined {
  const made = constructed(scope, node.callee);
  if (made === undefined) {
    return undefined;
  }
  const { context } = scope;
  const [config] = node.arguments;
  if (node.type === AST_NODE_TYPES.NewExpression && isAwsClient(made)) {
    return { kind: 'aws', name: made.name, state: awsState(context, config) };
  }
  if (node.type === AST_NODE_TYPES.NewExpression && isPgClient(made)) {
    const name = made.name === '*' ? 'Pool' : made.name;
    const state = listensOnConnect(context, node) ? UNKNOWN : postgresOptionsState(context, config);
    return { kind: 'database', name: `pg ${String(name)}`, state };
  }
  if (
    node.type === AST_NODE_TYPES.CallExpression &&
    made.source === 'postgres' &&
    made.name === '*'
  ) {
    return {
      kind: 'database',
      name: 'postgres()',
      state: postgresJsState(context, node.arguments),
    };
  }
  return undefined;
}
