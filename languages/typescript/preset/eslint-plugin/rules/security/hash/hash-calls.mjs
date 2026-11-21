import { AST_NODE_TYPES } from '@typescript-eslint/utils';
import { stringValue } from "../../analysis/constant-resolution.mjs";
import { ancestorsOf } from "../../typed/node-views.mjs";
import { importedFunction } from "../imported-names.mjs";
import { leafValues, memberName, propertyNamed, staticKey, unwrapped, } from "../security-values.mjs";
import { isHmacCall, isHmacOptions, isWeak } from "./hash-sources.mjs";
export const CRYPTO_JS_WEAK = new Set([
    'MD5',
    'SHA1',
    'HmacMD5',
    'HmacSHA1',
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
const HASH_SUFFIX = 'es|ed|With\\w*|Of|For|Sync|Async|File|Text|String|Buffer|Bytes|Hex|Base64|Stream';
const HASH_CALL_NAME = new RegExp(`(?:hash|digest|checksum|hmac|fingerprint)(?:${HASH_SUFFIX})?$`, 'iu');
const PREDICATE_NAME = /^(?:is|has|assert|reject|supports?|check|validate|ensure|allow)[A-Z_]/u;
const HASH_PROPERTY = /^(?:(?:hash|digest|checksum|signature|hmac)-?(?:algorithm|alg|function|name|type)?|algorithm|alg)$/iu;
const ARGUMENT_WRAPPERS = new Set([
    AST_NODE_TYPES.Property,
    AST_NODE_TYPES.ObjectExpression,
    AST_NODE_TYPES.ArrayExpression,
    AST_NODE_TYPES.SpreadElement,
]);
export function weakLeaves(context, node) {
    return node === undefined
        ? []
        : leafValues(context, node).filter((leaf) => {
            const text = stringValue(leaf);
            return text !== undefined && isWeak(text);
        });
}
function nameOf(callee) {
    const target = unwrapped(callee);
    if (target.type === AST_NODE_TYPES.Identifier) {
        return target.name;
    }
    return target.type === AST_NODE_TYPES.MemberExpression ? memberName(target) : undefined;
}
function isSubtle(callee) {
    const target = unwrapped(callee);
    const object = target.type === AST_NODE_TYPES.MemberExpression ? target.object : undefined;
    const named = object?.type === AST_NODE_TYPES.Identifier && object.name === 'subtle';
    return (named || (object?.type === AST_NODE_TYPES.MemberExpression && memberName(object) === 'subtle'));
}
function objectEntries(argument) {
    const object = unwrapped(argument);
    return object.type === AST_NODE_TYPES.ObjectExpression ? object.properties : [];
}
function subtleEntryLeaves(context, entry) {
    const key = staticKey(entry);
    if ((key !== 'hash' && key !== 'name') || entry.type !== AST_NODE_TYPES.Property) {
        return [];
    }
    return [
        ...weakLeaves(context, entry.value),
        ...weakLeaves(context, propertyNamed(context, entry.value, 'name')),
    ];
}
function subtleFinding(context, call) {
    return {
        hmac: call.arguments.some((argument) => isHmacOptions(unwrapped(argument))),
        leaves: call.arguments.flatMap((argument) => [
            ...weakLeaves(context, argument),
            ...objectEntries(argument).flatMap((entry) => subtleEntryLeaves(context, entry)),
        ]),
    };
}
function directFinding(context, call, name) {
    if (ALGORITHM_FIRST.has(name) || name === 'sign' || name === 'verify') {
        return { hmac: name === 'createHmac', leaves: weakLeaves(context, call.arguments[0]) };
    }
    const position = DIGEST_ARGUMENT.get(name);
    const argument = position === undefined ? undefined : call.arguments[position];
    return { hmac: false, leaves: weakLeaves(context, argument) };
}
function wrapperFinding(context, call) {
    const leaves = call.arguments.flatMap((argument) => [
        ...weakLeaves(context, argument),
        ...objectEntries(argument).flatMap((entry) => entry.type === AST_NODE_TYPES.Property && HASH_PROPERTY.test(staticKey(entry) ?? '')
            ? weakLeaves(context, entry.value)
            : []),
    ]);
    return { hmac: isHmacCall(call), leaves };
}
export function callFinding({ context, crypto, cryptoJs }, node) {
    const direct = importedFunction(context, node.callee, crypto);
    const cryptoJsName = importedFunction(context, node.callee, cryptoJs);
    const name = nameOf(node.callee);
    if (cryptoJsName !== undefined && CRYPTO_JS_WEAK.has(cryptoJsName)) {
        return { hmac: cryptoJsName.startsWith('Hmac'), names: [cryptoJsName], leaves: [] };
    }
    if (direct !== undefined) {
        return directFinding(context, node, direct);
    }
    if (name !== undefined && SUBTLE_METHODS.has(name) && isSubtle(node.callee)) {
        return subtleFinding(context, node);
    }
    const wrapper = name !== undefined && HASH_CALL_NAME.test(name) && !PREDICATE_NAME.test(name);
    return wrapper ? wrapperFinding(context, node) : undefined;
}
export function isCheckedArgument(scope, node) {
    const call = ancestorsOf(node).find((owner) => !ARGUMENT_WRAPPERS.has(owner.type));
    return call?.type === AST_NODE_TYPES.CallExpression && callFinding(scope, call) !== undefined;
}
export function isHashProperty(node) {
    const key = staticKey(node);
    return key !== undefined && HASH_PROPERTY.test(key);
}
