import { ancestorsOf } from '../analysis/ancestry.mjs';
import { stringValue } from '../analysis/constant-resolution.mjs';
import {
  bindingsOf,
  importedFunction,
  leafValues,
  memberName,
  propertyNamed,
  staticKey,
  unwrapped,
} from './security-values.mjs';

const CRYPTO_MODULES = new Set(['crypto', 'node:crypto', 'create-hash', 'crypto-browserify']);
const CRYPTO_JS = new Set(['crypto-js']);
const CRYPTO_JS_WEAK = new Set(['MD5', 'SHA1', 'HmacMD5', 'HmacSHA1']);
const WEAK_PACKAGES = new Set([
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
  'crypto-js/hmac-md5',
  'crypto-js/hmac-sha1',
]);
const ALGORITHM_FIRST = new Set(['createHash', 'createHmac', 'createSign', 'createVerify', 'hash']);
const DIGEST_ARGUMENT = new Map([
  ['pbkdf2', 4],
  ['pbkdf2Sync', 4],
  ['hkdf', 0],
  ['hkdfSync', 0],
]);
const SUBTLE_METHODS = new Set([
  'digest',
  'sign',
  'verify',
  'importKey',
  'generateKey',
  'deriveBits',
  'deriveKey',
]);
const WEAK_ALGORITHM = /(?:^|-)(?:md2|md4|md5|sha-?1|ripemd-?160|rmd160)(?:$|-|with)/u;
const HASH_CALL_NAME = /hash|digest|checksum|hmac|fingerprint/iu;
const HASH_PROPERTY =
  /^(?:(?:hash|digest|checksum|signature|hmac)-?(?:algorithm|alg|function|name|type)?|algorithm|alg)$/iu;

function isWeak(text) {
  return WEAK_ALGORITHM.test(text.toLowerCase().replaceAll(/[\s_]/gu, '-'));
}

function weakNames(context, node) {
  return node === undefined
    ? []
    : leafValues(context, node)
        .map((leaf) => stringValue(leaf))
        .filter((text) => text !== undefined && isWeak(text));
}

function nameOf(callee) {
  const target = unwrapped(callee);
  if (target.type === 'Identifier') {
    return target.name;
  }
  return target.type === 'MemberExpression' ? memberName(target) : undefined;
}

function isSubtle(callee) {
  const object = unwrapped(callee).object;
  const named = object?.type === 'Identifier' && object.name === 'subtle';
  return named || (object?.type === 'MemberExpression' && memberName(object) === 'subtle');
}

function objectEntries(argument) {
  const object = unwrapped(argument);
  return object?.type === 'ObjectExpression' ? object.properties : [];
}

function subtleEntryAlgorithms(context, entry) {
  const key = staticKey(entry);
  if (key !== 'hash' && key !== 'name') {
    return [];
  }
  return [
    ...weakNames(context, entry.value),
    ...weakNames(context, propertyNamed(context, entry.value, 'name')),
  ];
}

function subtleAlgorithms(context, call) {
  return call.arguments.flatMap((argument) => [
    ...weakNames(context, argument),
    ...objectEntries(argument).flatMap((entry) => subtleEntryAlgorithms(context, entry)),
  ]);
}

function directAlgorithms(context, call, name) {
  if (ALGORITHM_FIRST.has(name)) {
    return weakNames(context, call.arguments[0]);
  }
  if (name === 'sign' || name === 'verify') {
    return weakNames(context, call.arguments[0]);
  }
  return DIGEST_ARGUMENT.has(name)
    ? weakNames(context, call.arguments[DIGEST_ARGUMENT.get(name)])
    : [];
}

function wrapperEntryAlgorithms(context, entry) {
  const key = staticKey(entry);
  return key !== undefined && HASH_PROPERTY.test(key) ? weakNames(context, entry.value) : [];
}

function wrapperAlgorithms(context, call) {
  return call.arguments.flatMap((argument) => [
    ...weakNames(context, argument),
    ...objectEntries(argument).flatMap((entry) => wrapperEntryAlgorithms(context, entry)),
  ]);
}

function packageSource(node) {
  if (node.type === 'ImportDeclaration') {
    return node.source.value;
  }
  const isRequire =
    node.type === 'CallExpression' &&
    node.callee.type === 'Identifier' &&
    node.callee.name === 'require';
  return isRequire ? stringValue(node.arguments[0]) : undefined;
}

const ARGUMENT_WRAPPERS = new Set([
  'Property',
  'ObjectExpression',
  'ArrayExpression',
  'SpreadElement',
]);

function reportAll({ context }, node, algorithms) {
  for (const algorithm of new Set(algorithms)) {
    context.report({ node, messageId: 'weakHash', data: { algorithm } });
  }
}

function callAlgorithms({ context, crypto, cryptoJs }, node) {
  const direct = importedFunction(context, node.callee, crypto);
  const cryptoJsName = importedFunction(context, node.callee, cryptoJs);
  const name = nameOf(node.callee);
  if (CRYPTO_JS_WEAK.has(cryptoJsName)) {
    return [cryptoJsName];
  }
  if (direct !== undefined) {
    return directAlgorithms(context, node, direct);
  }
  if (name !== undefined && SUBTLE_METHODS.has(name) && isSubtle(node.callee)) {
    return subtleAlgorithms(context, node);
  }
  return name !== undefined && HASH_CALL_NAME.test(name)
    ? wrapperAlgorithms(context, node)
    : undefined;
}

function isCheckedArgument(scope, node) {
  const call = ancestorsOf(node).find((owner) => !ARGUMENT_WRAPPERS.has(owner.type));
  return call?.type === 'CallExpression' && callAlgorithms(scope, call) !== undefined;
}

function checkPackage({ context }, node) {
  const source = packageSource(node);
  if (WEAK_PACKAGES.has(source)) {
    context.report({ node, messageId: 'weakPackage', data: { name: source } });
  }
}

function checkProperty(scope, node) {
  const key = staticKey(node);
  if (key !== undefined && HASH_PROPERTY.test(key) && !isCheckedArgument(scope, node)) {
    reportAll(scope, node.value, weakNames(scope.context, node.value));
  }
}

export const rule = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow MD5 and SHA-1 hashing' },
    schema: [],
    messages: {
      weakHash:
        '{{algorithm}} is a broken hash: collisions are cheap and brute force is fast. Hash with `createHash("sha256")` (or sha384, sha512, sha3-256), sign with `createHmac("sha256", key)`, and hash passwords with `scrypt` from node:crypto, argon2 or bcrypt. If a protocol you do not control requires it (a legacy signature header, an ETag), add an exception for this rule in nitpicker.config.json.',
      weakPackage:
        '`{{name}}` only computes MD5 or SHA-1, which are broken hashes. Use `createHash("sha256")` from node:crypto (or sha384, sha512, sha3-256), and hash passwords with `scrypt`, argon2 or bcrypt. If a protocol you do not control requires it, add an exception for this rule in nitpicker.config.json.',
    },
  },
  create(context) {
    let scope;

    return {
      Program(node) {
        scope = {
          context,
          crypto: bindingsOf(node, CRYPTO_MODULES),
          cryptoJs: bindingsOf(node, CRYPTO_JS),
        };
      },
      ImportDeclaration(node) {
        checkPackage(scope, node);
      },
      CallExpression(node) {
        checkPackage(scope, node);
        reportAll(scope, node, callAlgorithms(scope, node) ?? []);
      },
      Property(node) {
        checkProperty(scope, node);
      },
    };
  },
};
