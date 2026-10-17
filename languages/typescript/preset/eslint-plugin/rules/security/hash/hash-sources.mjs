import { stringValue } from '../../analysis/constant-resolution.mjs';
import { memberName, staticKey, unwrapped } from '../security-values.mjs';

const WEAK_NAME =
  /^(?:(?:rsa|dsa|ecdsa)-(?:with-)?)?(?:md[245]|sha-?1|ripemd-?160|rmd-?160)(?:-?with-?(?:rsa|dsa)?-?encryption|-?with-?rsa)?$/u;
const MD_NAME = /^(?:hmac)?md[245]$/iu;
const HMAC_CALL = /hmac/iu;
const OTP_KEYS = new Set(['digits', 'period', 'step', 'counter', 'window', 'secret', 'issuer']);

export const WEAK_PACKAGES = new Set([
  'md5',
  'md5.js',
  'js-md5',
  'blueimp-md5',
  'spark-md5',
  'ts-md5',
  'sha1',
  'js-sha1',
  'crypto-js/md5',
  'crypto-js/sha1',
]);
export const HMAC_PACKAGES = new Map([
  ['crypto-js/hmac-md5', 'md5'],
  ['crypto-js/hmac-sha1', 'sha1'],
]);
const NOBLE_WEAK = new Set(['md5', 'sha1', 'ripemd160']);
const HASH_WASM_WEAK = new Set([
  'md4',
  'md5',
  'sha1',
  'ripemd160',
  'createMD4',
  'createMD5',
  'createSHA1',
  'createRIPEMD160',
]);
const NAMED_SOURCES = new Map([
  ['@noble/hashes/legacy', NOBLE_WEAK],
  ['@noble/hashes/legacy.js', NOBLE_WEAK],
  ['@noble/hashes/sha1', NOBLE_WEAK],
  ['@noble/hashes/sha1.js', NOBLE_WEAK],
  ['@noble/hashes/ripemd160', NOBLE_WEAK],
  ['@noble/hashes/ripemd160.js', NOBLE_WEAK],
  ['hash-wasm', HASH_WASM_WEAK],
]);

export function isWeak(text) {
  return WEAK_NAME.test(text.toLowerCase().replaceAll(/[\s_]/gu, '-'));
}

export function isMessageDigest(text) {
  return MD_NAME.test(text.replace(/^create/u, ''));
}

export function weakNamedImports(source) {
  return NAMED_SOURCES.get(source);
}

export function packageSource(node) {
  if (node.type === 'ImportDeclaration') {
    return node.source.value;
  }
  const isRequire =
    node.type === 'CallExpression' &&
    node.callee.type === 'Identifier' &&
    node.callee.name === 'require';
  return isRequire ? stringValue(node.arguments[0]) : undefined;
}

function calleeName(call) {
  const callee = unwrapped(call.callee);
  if (callee.type === 'Identifier') {
    return callee.name;
  }
  return callee.type === 'MemberExpression' ? memberName(callee) : undefined;
}

export function isHmacCall(call) {
  return HMAC_CALL.test(calleeName(call) ?? '');
}

export function isHmacArgument(identifier) {
  const owner = identifier.parent;
  if (owner.type === 'CallExpression' && owner.arguments.includes(identifier)) {
    return isHmacCall(owner);
  }
  const created =
    owner.type === 'CallExpression' && owner.callee === identifier ? owner : undefined;
  const outer = created?.parent;
  return outer?.type === 'CallExpression' && outer.arguments.includes(created) && isHmacCall(outer);
}

export function isHmacOptions(object) {
  const entries = object?.type === 'ObjectExpression' ? object.properties : [];
  return entries.some((entry) => {
    const key = staticKey(entry);
    return (
      OTP_KEYS.has(key) || (key === 'name' && stringValue(entry.value)?.toUpperCase() === 'HMAC')
    );
  });
}
