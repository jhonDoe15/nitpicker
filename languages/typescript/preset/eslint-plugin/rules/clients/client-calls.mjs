import { calleeLabel, constructedName } from '../database/orm-modules.mjs';
import { findVariable, stringValue } from '../analysis/constant-resolution.mjs';
import { memberName, resolvedValue, staticKey, unwrapped } from '../security/security-values.mjs';
import {
  either,
  keyState,
  MISSING,
  nestedState,
  optionsOf,
  postgresOptionsState,
  textState,
  UNKNOWN,
} from './timeout-options.mjs';

const AWS_MODULE = /^@aws-sdk\/client-/u;
const PG_MODULES = new Set(['pg', 'pg-pool']);
const PG_CLASSES = new Set(['Pool', 'Client']);
const MODULE_SCOPES = new Set(['module', 'global']);
const CLASS_NAME = /^[A-Z]/u;
const NOT_CLIENT = /(?:Command|Exception|Input|Output)$/u;
const HANDLERS = new Set(['NodeHttpHandler', 'NodeHttp2Handler', 'FetchHttpHandler']);

function moduleBinding(scope, target) {
  const variable = findVariable(scope.context, target, target.name);
  const definition = variable?.defs[0];
  if (variable === undefined || !MODULE_SCOPES.has(variable.scope.type)) {
    return undefined;
  }
  const pattern = definition?.node?.id;
  const init = unwrapped(definition?.node?.init);
  const fromNamespace =
    definition?.type === 'Variable' &&
    pattern?.type === 'ObjectPattern' &&
    init?.type === 'Identifier';
  const namespace = fromNamespace ? scope.bindings.get(init.name) : undefined;
  if (namespace?.imported === '*') {
    const property = pattern.properties.find(
      (entry) => entry.type === 'Property' && entry.value?.name === target.name,
    );
    return { source: namespace.source, imported: staticKey(property) };
  }
  return scope.bindings.get(target.name);
}

function bindingOf(scope, node) {
  const target = unwrapped(node);
  return target?.type === 'Identifier' ? moduleBinding(scope, target) : undefined;
}

function namespaceOwner(scope, node) {
  const target = unwrapped(node);
  const owner =
    target?.type === 'MemberExpression' && memberName(target) === 'native' ? target.object : target;
  return bindingOf(scope, owner);
}

function constructed(scope, callee) {
  const target = unwrapped(callee);
  if (target.type === 'Identifier') {
    const binding = bindingOf(scope, target);
    return binding === undefined ? undefined : { ...binding, name: binding.imported };
  }
  const owner =
    target.type === 'MemberExpression' ? namespaceOwner(scope, target.object) : undefined;
  return owner?.imported === '*' ? { ...owner, name: memberName(target) } : undefined;
}

function isAwsClient(made) {
  return (
    AWS_MODULE.test(made.source) &&
    CLASS_NAME.test(made.name ?? '') &&
    !NOT_CLIENT.test(made.name ?? '')
  );
}

function listensOnConnect(context, node) {
  const declarator = node.parent;
  if (declarator?.type !== 'VariableDeclarator' || declarator.id.type !== 'Identifier') {
    return false;
  }
  const variable = findVariable(context, declarator.id, declarator.id.name);
  return (variable?.references ?? []).some((reference) => {
    const member = reference.identifier.parent;
    const call = member?.parent;
    return (
      member?.type === 'MemberExpression' &&
      memberName(member) === 'on' &&
      call?.type === 'CallExpression' &&
      stringValue(call.arguments[0]) === 'connect'
    );
  });
}

function isPgClient(made) {
  if (made.source === 'pg-pool') {
    return made.name === '*';
  }
  return PG_MODULES.has(made.source) && PG_CLASSES.has(made.name);
}

function handlerState(context, node) {
  const value = resolvedValue(context, node);
  if (value?.type === 'ObjectExpression') {
    return requestTimeoutState(context, value);
  }
  const isHandler =
    (value?.type === 'NewExpression' && HANDLERS.has(constructedName(value))) ||
    (value?.type === 'CallExpression' &&
      HANDLERS.has(calleeLabel(value)?.split('.')[0]) &&
      constructedName(value) === 'create');
  if (!isHandler) {
    return UNKNOWN;
  }
  return value.arguments.length === 0 ? MISSING : requestTimeoutState(context, value.arguments[0]);
}

function requestTimeoutState(context, node) {
  const options = optionsOf(context, node);
  return options === undefined
    ? UNKNOWN
    : either([keyState(options, 'requestTimeout'), keyState(options, 'socketTimeout')]);
}

function awsState(context, config) {
  if (config === undefined) {
    return MISSING;
  }
  const options = optionsOf(context, config);
  return options === undefined ? UNKNOWN : nestedState(options, 'requestHandler', handlerState);
}

function connectionState(context, node) {
  const options = optionsOf(context, node);
  return options === undefined ? UNKNOWN : keyState(options, 'statement_timeout');
}

function postgresJsState(context, args) {
  const first = optionsOf(context, args[0]);
  const url = first === undefined ? args[0] : undefined;
  const settings = first === undefined ? optionsOf(context, args[1]) : first;
  const urlState = url === undefined ? MISSING : textState(context, url, MISSING);
  if (settings === undefined) {
    return args.length > 1 && first === undefined ? either([urlState, UNKNOWN]) : urlState;
  }
  return either([urlState, nestedState(settings, 'connection', connectionState)]);
}

export function clientTimeout(scope, node) {
  const made = constructed(scope, node.callee);
  if (made === undefined) {
    return undefined;
  }
  const { context } = scope;
  const [config] = node.arguments;
  if (node.type === 'NewExpression' && isAwsClient(made)) {
    return { kind: 'aws', name: made.name, state: awsState(context, config) };
  }
  if (node.type === 'NewExpression' && isPgClient(made)) {
    const name = made.name === '*' ? 'Pool' : made.name;
    const state = listensOnConnect(context, node) ? UNKNOWN : postgresOptionsState(context, config);
    return { kind: 'database', name: `pg ${name}`, state };
  }
  if (node.type === 'CallExpression' && made.source === 'postgres' && made.name === '*') {
    return {
      kind: 'database',
      name: 'postgres()',
      state: postgresJsState(context, node.arguments),
    };
  }
  return undefined;
}
