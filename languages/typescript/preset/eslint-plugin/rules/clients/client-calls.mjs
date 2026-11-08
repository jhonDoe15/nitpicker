import { calleeLabel, constructedName } from '../database/orm-modules.mjs';
import { memberName, resolvedValue, unwrapped } from '../security/security-values.mjs';
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
const HANDLERS = new Set(['NodeHttpHandler', 'NodeHttp2Handler', 'FetchHttpHandler']);

function bindingOf(scope, node) {
  const target = unwrapped(node);
  return target?.type === 'Identifier' ? scope.bindings.get(target.name) : undefined;
}

function constructed(scope, callee) {
  const target = unwrapped(callee);
  if (target.type === 'Identifier') {
    const binding = bindingOf(scope, target);
    return binding === undefined ? undefined : { ...binding, name: binding.imported };
  }
  const owner = target.type === 'MemberExpression' ? bindingOf(scope, target.object) : undefined;
  return owner?.imported === '*' ? { ...owner, name: memberName(target) } : undefined;
}

function isAwsClient(made) {
  return AWS_MODULE.test(made.source) && made.name?.endsWith('Client') === true;
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
    return { kind: 'database', name: `pg ${name}`, state: postgresOptionsState(context, config) };
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
