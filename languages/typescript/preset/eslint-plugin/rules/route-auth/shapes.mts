import { wordsOf as untypedWordsOf } from '../../../../../../shared/naming/secret-words.mjs';
import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { stringValue } from '../analysis/constant-resolution.mts';
import { calleeNameOf } from '../typed/syntax-views.mts';

export type DecoratorInfo = {
  readonly name: string | undefined;
  readonly shape: string;
  readonly isAuth: boolean;
  readonly isPublic: boolean;
};

const wordsOf: (name: string) => string[] = untypedWordsOf;

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

export function isAuthName(name: string | undefined): boolean {
  return (
    typeof name === 'string' &&
    !NOT_AUTH.test(name) &&
    wordsOf(name).some((word) => AUTH_WORDS.has(word))
  );
}

function guardsOnlyThrottling(
  name: string | undefined,
  call: TSESTree.CallExpression | undefined,
): boolean {
  const guards = (call?.arguments ?? []).map((arg) =>
    arg.type === AST_NODE_TYPES.Identifier ? arg.name : '',
  );
  return name === 'UseGuards' && guards.length > 0 && guards.every((guard) => NOT_AUTH.test(guard));
}

function isPublicName(name: string | undefined): boolean {
  const words = typeof name === 'string' ? wordsOf(name) : [];
  const bypass = words.some((word) => BYPASS_WORDS.has(word)) && isAuthName(name);
  return bypass || words.some((word) => PUBLIC_WORDS.has(word));
}

function keyName(property: TSESTree.Node): string | undefined {
  if (property.type !== AST_NODE_TYPES.Property) {
    return undefined;
  }
  return property.key.type === AST_NODE_TYPES.Identifier
    ? property.key.name
    : stringValue(property.key);
}

export function decoratorInfo(decorator: TSESTree.Decorator): DecoratorInfo {
  const { expression } = decorator;
  const call = expression.type === AST_NODE_TYPES.CallExpression ? expression : undefined;
  const name = calleeNameOf(call === undefined ? expression : call.callee);
  const options =
    call?.arguments[0]?.type === AST_NODE_TYPES.ObjectExpression ? call.arguments[0] : undefined;
  const properties = options?.properties ?? [];
  const keys = properties
    .map(keyName)
    .filter((key) => key !== undefined)
    .sort();
  const disabled = properties.some(
    (property) =>
      property.type === AST_NODE_TYPES.Property &&
      isAuthName(keyName(property)) &&
      property.value.type === AST_NODE_TYPES.Literal &&
      property.value.value === false,
  );
  return {
    name,
    shape: [name, ...keys].join(SEPARATOR),
    isAuth: isAuthName(name) && !isPublicName(name) && !guardsOnlyThrottling(name, call),
    isPublic: isPublicName(name) || disabled,
  };
}

export function shapeLabel(shape: string): string {
  const [name, ...keys] = shape.split(SEPARATOR);
  return keys.length === 0 ? `@${name}()` : `@${name}({ ${keys.join(', ')} })`;
}
