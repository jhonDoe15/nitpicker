import { ancestorsOf } from '../../analysis/ancestry.mjs';
import { stringValue } from '../../analysis/constant-resolution.mjs';
import { bindingsOf, importedFunction, isModuleValue } from '../imported-names.mjs';
import {
  leafValues,
  memberName,
  propertyNamed,
  staticKey,
  unwrapped,
} from '../security-values.mjs';
import {
  hmacPackageAlgorithm,
  isHmacArgument,
  isHmacCall,
  isHmacOptions,
  isMessageDigest,
  isWeak,
  isWeakPackage,
  packageSource,
  weakNamedImports,
} from './hash-sources.mjs';

const CRYPTO_MODULES = new Set(['crypto', 'node:crypto', 'create-hash', 'crypto-browserify']);
const CRYPTO_JS = new Set(['crypto-js']);
const CRYPTO_JS_WEAK = new Set(['MD5', 'SHA1', 'HmacMD5', 'HmacSHA1']);
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
const HASH_SUFFIX =
  'es|ed|With\\w*|Of|For|Sync|Async|File|Text|String|Buffer|Bytes|Hex|Base64|Stream';
const HASH_CALL_NAME = new RegExp(
  `(?:hash|digest|checksum|hmac|fingerprint)(?:${HASH_SUFFIX})?$`,
  'iu',
);
const PREDICATE_NAME = /^(?:is|has|assert|reject|supports?|check|validate|ensure|allow)[A-Z_]/u;
const HASH_PROPERTY =
  /^(?:(?:hash|digest|checksum|signature|hmac)-?(?:algorithm|alg|function|name|type)?|algorithm|alg)$/iu;
const ARGUMENT_WRAPPERS = new Set([
  'Property',
  'ObjectExpression',
  'ArrayExpression',
  'SpreadElement',
]);

function weakLeaves(context, node) {
  return node === undefined
    ? []
    : leafValues(context, node).filter((leaf) => {
        const text = stringValue(leaf);
        return text !== undefined && isWeak(text);
      });
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

function subtleEntryLeaves(context, entry) {
  const key = staticKey(entry);
  if (key !== 'hash' && key !== 'name') {
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
  return { hmac: false, leaves: weakLeaves(context, call.arguments[position]) };
}

function wrapperFinding(context, call) {
  const leaves = call.arguments.flatMap((argument) => [
    ...weakLeaves(context, argument),
    ...objectEntries(argument).flatMap((entry) =>
      HASH_PROPERTY.test(staticKey(entry) ?? '') ? weakLeaves(context, entry.value) : [],
    ),
  ]);
  return { hmac: isHmacCall(call), leaves };
}

function callFinding({ context, crypto, cryptoJs }, node) {
  const direct = importedFunction(context, node.callee, crypto);
  const cryptoJsName = importedFunction(context, node.callee, cryptoJs);
  const name = nameOf(node.callee);
  if (CRYPTO_JS_WEAK.has(cryptoJsName)) {
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

function isCheckedArgument(scope, node) {
  const call = ancestorsOf(node).find((owner) => !ARGUMENT_WRAPPERS.has(owner.type));
  return call?.type === 'CallExpression' && callFinding(scope, call) !== undefined;
}

function isHashProperty(node) {
  const key = staticKey(node);
  return key !== undefined && HASH_PROPERTY.test(key);
}

function reportedAtProperty(scope, leaf) {
  const owner = leaf.parent;
  return owner?.value === leaf && isHashProperty(owner) && !isCheckedArgument(scope, owner);
}

function report({ context }, node, { algorithm, hmac }) {
  if (hmac && !isMessageDigest(algorithm)) {
    return;
  }
  const messageId = hmac ? 'weakHmac' : 'weakHash';
  context.report({ node, messageId, data: { algorithm } });
}

function reportFinding(scope, node, finding) {
  const kept = finding.leaves.filter((leaf) => !reportedAtProperty(scope, leaf));
  const names = [...(finding.names ?? []), ...kept.map((leaf) => stringValue(leaf))];
  for (const algorithm of new Set(names)) {
    report(scope, node, { algorithm, hmac: finding.hmac });
  }
}

function checkPackage(scope, node) {
  const source = packageSource(node);
  if (isWeakPackage(source)) {
    scope.context.report({ node, messageId: 'weakPackage', data: { name: source } });
  }
  const hmacAlgorithm = hmacPackageAlgorithm(source);
  if (hmacAlgorithm !== undefined) {
    report(scope, node, { algorithm: hmacAlgorithm, hmac: true });
  }
}

function checkNamedImports(scope, node) {
  const weak = weakNamedImports(node.source.value);
  for (const specifier of weak === undefined ? [] : node.specifiers) {
    const imported = specifier.imported?.name ?? specifier.imported?.value;
    const [variable] = scope.context.sourceCode.getDeclaredVariables(specifier);
    const uses = variable?.references ?? [];
    const hmac = uses.length > 0 && uses.every((use) => isHmacArgument(use.identifier));
    if (weak.has(imported) && hmac) {
      const algorithm = imported.replace(/^create/u, '').toLowerCase();
      report(scope, specifier, { algorithm, hmac: true });
    } else if (weak.has(imported)) {
      const name = `${imported} from ${node.source.value}`;
      scope.context.report({ node: specifier, messageId: 'weakPackage', data: { name } });
    }
  }
}

function isCryptoJsHmacKey(node) {
  const call = node.parent;
  const callee = call.type === 'CallExpression' ? unwrapped(call.callee) : undefined;
  const owner = callee?.type === 'MemberExpression' ? unwrapped(callee.object) : undefined;
  return (
    call.arguments?.includes(node) === true &&
    owner?.type === 'MemberExpression' &&
    memberName(owner) === 'HMAC'
  );
}

function checkCryptoJsAlgo(scope, node) {
  const algorithm = memberName(node);
  const owner = unwrapped(node.object);
  const isAlgo =
    CRYPTO_JS_WEAK.has(algorithm) &&
    owner.type === 'MemberExpression' &&
    memberName(owner) === 'algo' &&
    isModuleValue(scope.context, owner.object, scope.cryptoJs);
  if (isAlgo) {
    report(scope, node, { algorithm, hmac: isCryptoJsHmacKey(node) });
  }
}

function checkProperty(scope, node) {
  if (isHashProperty(node) && node.value !== null && !isCheckedArgument(scope, node)) {
    const hmac = isHmacOptions(node.parent);
    for (const algorithm of new Set(
      weakLeaves(scope.context, node.value).map((leaf) => stringValue(leaf)),
    )) {
      report(scope, node, { algorithm, hmac });
    }
  }
}

export const rule = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow MD5 and SHA-1 hashing' },
    schema: [],
    messages: {
      weakHash:
        '{{algorithm}} is a broken hash: collisions are cheap and brute force is fast. Hash with `createHash("sha256")` (or sha384, sha512, sha3-256), sign with `createHmac("sha256", key)`, and hash passwords with `scrypt` from node:crypto, argon2 or bcrypt. If a protocol you do not control requires it (a legacy signature header, an ETag, a git object id), add an exception for this rule in nitpicker.config.json.',
      weakHmac:
        'HMAC with {{algorithm}} rests on MD5, which is broken and no longer approved for message authentication. Sign with `createHmac("sha256", key)`; HMAC-SHA1 is accepted where a protocol fixes it (TOTP, OAuth 1.0a). If a protocol you do not control requires HMAC-MD5, add an exception for this rule in nitpicker.config.json.',
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
        checkNamedImports(scope, node);
      },
      CallExpression(node) {
        checkPackage(scope, node);
        const finding = callFinding(scope, node);
        if (finding !== undefined) {
          reportFinding(scope, node, finding);
        }
      },
      MemberExpression(node) {
        checkCryptoJsAlgo(scope, node);
      },
      'Property, PropertyDefinition'(node) {
        checkProperty(scope, node);
      },
    };
  },
};
