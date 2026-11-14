import { wordsOf } from '../../../../../../shared/naming/secret-words.mjs';
import { stringValue } from '../analysis/constant-resolution.mjs';

const AUTH_WORDS = new Set([
  'auth',
  'authenticate',
  'authenticated',
  'authorize',
  'authorized',
  'authorization',
  'guard',
  'guards',
  'roles',
  'role',
  'permission',
  'permissions',
  'jwt',
  'protected',
  'secure',
  'secured',
  'scopes',
  'acl',
  'policy',
  'policies',
  'logged',
  'token',
  'session',
]);
const PUBLIC_WORDS = new Set(['public', 'anonymous', 'unauthenticated']);
const BYPASS_WORDS = new Set(['skip', 'no', 'allow', 'without', 'bypass', 'disable']);
const SEPARATOR = '__';
const NOT_AUTH = /^(?:Api[A-Z]\w*|Throttl\w*|SkipThrottle|Cache\w*)$/u;

export function isAuthName(name) {
  return (
    typeof name === 'string' &&
    !NOT_AUTH.test(name) &&
    wordsOf(name).some((word) => AUTH_WORDS.has(word))
  );
}

function guardsOnlyThrottling(name, call) {
  const guards = (call?.arguments ?? []).map((arg) => (arg.type === 'Identifier' ? arg.name : ''));
  return name === 'UseGuards' && guards.length > 0 && guards.every((guard) => NOT_AUTH.test(guard));
}

function isPublicName(name) {
  const words = typeof name === 'string' ? wordsOf(name) : [];
  const bypass = words.some((word) => BYPASS_WORDS.has(word)) && isAuthName(name);
  return bypass || words.some((word) => PUBLIC_WORDS.has(word));
}

function calleeName(expression) {
  if (expression.type === 'Identifier') {
    return expression.name;
  }
  return expression.type === 'MemberExpression' && !expression.computed
    ? expression.property.name
    : undefined;
}

function keyName(property) {
  if (property.type !== 'Property') {
    return undefined;
  }
  return property.key.type === 'Identifier' ? property.key.name : stringValue(property.key);
}

export function decoratorInfo(decorator) {
  const { expression } = decorator;
  const call = expression.type === 'CallExpression' ? expression : undefined;
  const name = calleeName(call === undefined ? expression : call.callee);
  const options = call?.arguments[0]?.type === 'ObjectExpression' ? call.arguments[0] : undefined;
  const properties = options?.properties ?? [];
  const keys = properties
    .map(keyName)
    .filter((key) => key !== undefined)
    .sort();
  const disabled = properties.some(
    (property) =>
      isAuthName(keyName(property)) &&
      property.value?.type === 'Literal' &&
      property.value.value === false,
  );
  return {
    name,
    shape: [name, ...keys].join(SEPARATOR),
    isAuth: isAuthName(name) && !isPublicName(name) && !guardsOnlyThrottling(name, call),
    isPublic: isPublicName(name) || disabled,
  };
}

export function shapeLabel(shape) {
  const [name, ...keys] = shape.split(SEPARATOR);
  return keys.length === 0 ? `@${name}()` : `@${name}({ ${keys.join(', ')} })`;
}
