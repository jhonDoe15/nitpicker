import { callsIn } from '../../syntax/kotlin-calls.mjs';
import { plainText } from '../../syntax/expressions/kotlin-strings.mjs';
import { contextAt } from '../../syntax/expressions/kotlin-scope.mjs';
import { receiverMatches } from '../../syntax/kotlin-receivers.mjs';
import { descendants, kids } from '../../syntax/kotlin-tree.mjs';
import { DEFAULT_VALUE, VALUE } from '../../names/spring-annotations.mjs';
import { PROPERTY_RESOLVERS } from '../../names/spring-types.mjs';
import { defineRule, hitOn, sitesOfType, symbolAtNode } from '../rule-support.mjs';

const SECRET_WORDS = new Set([
  'password',
  'passwd',
  'passphrase',
  'secret',
  'token',
  'credential',
  'credentials',
  'apikey',
  'privatekey',
  'secretkey',
  'accesskey',
  'signingkey',
  'encryptionkey',
  'hmackey',
  'jwtkey',
  'cryptokey',
  'masterkey',
]);
const KEY_OWNERS = new Set([
  'api',
  'jwt',
  'encryption',
  'signing',
  'hmac',
  'crypto',
  'master',
  'access',
  'secret',
  'private',
]);
const PLACEHOLDER = /^\$\{([^}:]+):([^}]*)\}$/;

function wordsOf(segment) {
  return (segment ?? '')
    .replaceAll(/\[\d+\]/g, '')
    .replaceAll(/([a-z\d])([A-Z])/g, '$1-$2')
    .replaceAll(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase()
    .split(/[-_]+/)
    .filter((word) => word !== '');
}

function isSecretKey(key) {
  const [lastSegment, ownerSegment] = key.split('.').toReversed();
  const last = wordsOf(lastSegment);
  const owner = wordsOf(ownerSegment).at(-1);
  const [tail, beforeTail] = last.toReversed();
  return (
    SECRET_WORDS.has(tail) ||
    (last.length > 1 && SECRET_WORDS.has(`${beforeTail}${tail}`)) ||
    (last.length === 1 && tail === 'key' && KEY_OWNERS.has(owner))
  );
}

function isFallback(value) {
  return value.length > 0 && !/^[#$]/.test(value);
}

function strings(file, root) {
  return descendants(root, (node) => node.t === 'STRING_TEMPLATE').flatMap((node) => {
    const text = plainText(file.source, node);
    return text === undefined ? [] : [{ node, text }];
  });
}

function placeholderHits(file) {
  return sitesOfType(file, VALUE).flatMap((site) =>
    strings(file, site.annotation.node)
      .map(({ node, text }) => ({ node, match: PLACEHOLDER.exec(text) }))
      .filter(({ match }) => match !== null && isSecretKey(match[1]) && isFallback(match[2]))
      .map(({ node }) => hitOn(node, `${site.symbol}@Value`)),
  );
}

function defaultValueHits(file) {
  return sitesOfType(file, DEFAULT_VALUE)
    .filter((site) => site.kind === 'parameter' && isSecretKey(site.decl.name))
    .flatMap((site) =>
      strings(file, site.annotation.node)
        .filter(({ text }) => isFallback(text))
        .map(({ node }) => hitOn(node, `${site.symbol}@DefaultValue`)),
    );
}

function propertyHits(file) {
  return callsIn(file.source, file.tree)
    .filter((call) => call.name === 'getProperty' && !call.reference && call.arguments.length === 2)
    .filter((call) => receiverMatches(contextAt(file, call.ancestors), call, PROPERTY_RESOLVERS))
    .flatMap((call) => {
      const [key, fallback] = call.arguments.map((argument) =>
        plainText(file.source, kids(argument)[0]),
      );
      return key !== undefined && fallback !== undefined && isSecretKey(key) && isFallback(fallback)
        ? [hitOn(call.node, `${symbolAtNode(file, call.ancestors)}@getProperty`)]
        : [];
    });
}

const valueSecretDefault = defineRule(
  'SpringValueSecretDefault',
  'Read this secret without a default, so a missing value fails at startup; a secret with a built-in fallback ships to production unnoticed.',
  (file) => [...placeholderHits(file), ...defaultValueHits(file), ...propertyHits(file)],
);

export const SECRET_DEFAULT_RULES = [valueSecretDefault];
