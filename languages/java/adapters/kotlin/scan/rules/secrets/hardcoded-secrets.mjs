import {
  hasCredentialShape,
  isHardcodedSecret,
  isSecretName,
} from '../../../../../../../shared/naming/secret-words.mjs';
import { literalIndex } from './literal-index.mjs';
import { valueLiterals } from './secret-values.mjs';

const TYPE = String.raw`(?:\s*:\s*[\w.]+(?:<[^=\n;{}()]*>)?\??)?`;
const ASSIGNED = new RegExp(String.raw`(?<!\w)([A-Za-z_]\w*)${TYPE}\s*=(?![=>])`, 'g');
const DELEGATED = new RegExp(String.raw`(?<!\w)([A-Za-z_]\w*)${TYPE}\s+by\b`, 'g');
const FUNCTION = new RegExp(String.raw`\bfun\s+([\w.<>]+)\s*\(\s*\)${TYPE}\s*([={])`, 'g');
const GETTER = new RegExp(
  String.raw`\b(?:val|var)\s+([A-Za-z_]\w*)${TYPE}\s+get\s*\(\s*\)${TYPE}\s*([={])`,
  'g',
);
const RETURN = /\s*return\b/y;
const KEYED = /"\s*(?:,|\bto\b|\)\s*\{)\s*/g;
const INDEXED = /"\s*\]\s*=(?![=>])\s*/g;
const CALL_NAME = /([A-Za-z_]\w*)\s*$/;
const KEYED_CALLS = new Set([
  'put',
  'putIfAbsent',
  'putString',
  'putExtra',
  'setProperty',
  'addProperty',
  'of',
  'entry',
  'Pair',
  'set',
  'getOrDefault',
  'getProperty',
]);
const KEYED_LAMBDAS = new Set(['getOrElse', 'getOrPut']);
const PROPERTY_DEFAULT = /\$\{([\w.-]+):([^}]*)\}/g;
const SPRING_IMPORT = /^\s*import\s+org\.springframework\./m;

function findings(scanned, from, name) {
  return valueLiterals(scanned, from)
    .filter(({ text }) => isHardcodedSecret(text, name))
    .map(({ start }) => ({ rule: 'HardcodedSecret', offset: start, subject: name }));
}

function bodyStart(scanned, match) {
  const end = match.index + match[0].length;
  if (match[2] === '=') {
    return end;
  }
  RETURN.lastIndex = end;
  return RETURN.test(scanned.code) ? RETURN.lastIndex : undefined;
}

function namedFindings(scanned, pattern) {
  return [...scanned.code.matchAll(pattern)].flatMap((match) => {
    const name = match[1].split('.').at(-1);
    const from = match[2] === undefined ? match.index + match[0].length : bodyStart(scanned, match);
    return from !== undefined && isSecretName(name) ? findings(scanned, from, name) : [];
  });
}

function callBefore(scanned, key) {
  const open = literalIndex(scanned).opens.get(key.start) ?? -1;
  const name =
    open === -1 ? undefined : CALL_NAME.exec(scanned.code.slice(Math.max(0, open - 64), open));
  return { bracket: scanned.code[open], name: name?.[1] };
}

function isKeyedCall(scanned, key, separator) {
  if (separator.includes('to')) {
    return true;
  }
  const call = callBefore(scanned, key);
  const calls = separator.includes('{') ? KEYED_LAMBDAS : KEYED_CALLS;
  return call.bracket === '(' && calls.has(call.name);
}

function keyedFindings(scanned, pattern) {
  const { byEnd } = literalIndex(scanned);
  return [...scanned.code.matchAll(pattern)].flatMap(({ index, 0: text }) => {
    const key = byEnd.get(index + 1);
    const keyed = key !== undefined && isSecretName(key.text);
    const from = index + text.length;
    return keyed && (pattern === INDEXED || isKeyedCall(scanned, key, text))
      ? findings(scanned, from, key.text)
      : [];
  });
}

function propertyDefaults(scanned) {
  if (SPRING_IMPORT.test(scanned.source)) {
    return [];
  }
  return scanned.literals.flatMap(({ start, text }) =>
    [...text.replaceAll('\\$', '$').matchAll(PROPERTY_DEFAULT)]
      .filter(([, key, fallback]) => isSecretName(key) && isHardcodedSecret(fallback, key))
      .map(([, key]) => ({ rule: 'HardcodedSecret', offset: start, subject: key })),
  );
}

export function hardcodedSecrets(scanned) {
  const all = [
    ...namedFindings(scanned, ASSIGNED),
    ...namedFindings(scanned, DELEGATED),
    ...namedFindings(scanned, FUNCTION),
    ...namedFindings(scanned, GETTER),
    ...keyedFindings(scanned, KEYED),
    ...keyedFindings(scanned, INDEXED),
    ...propertyDefaults(scanned),
  ];
  return [...new Map(all.map((finding) => [finding.offset, finding])).values()];
}

export function credentialLiterals(scanned) {
  return scanned.literals
    .filter(({ text }) => hasCredentialShape(text.replaceAll('\\$', '$')))
    .map(({ start }) => ({ rule: 'CredentialLiteral', offset: start }));
}
