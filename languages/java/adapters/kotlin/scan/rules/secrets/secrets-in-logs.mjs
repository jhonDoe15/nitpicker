import { isSecretName } from '../../../../../../../shared/naming/secret-words.mjs';
import { splitArguments } from '../../kotlin-source.mjs';
import { literalsWithin, withLiteralIndex } from './literal-index.mjs';
import { secretSinks } from './secret-sinks.mjs';

const TEMPLATE_REFERENCE = /\$(?:\{([^{}]*)\}|([A-Za-z_]\w*))/g;
const CHAIN = /^[A-Za-z_]\w*(?:[?!]*\.[A-Za-z_]\w*)*(?:\(\))?!*$/;
const CONVERTED = /\.(?:toString|toCharArray|orEmpty)\(\)$/;
const GETTER = /^get[A-Z]/;
const RECEIVER = /tokenizer$/i;
const CONSTANT = /^[A-Z][A-Z0-9_]*$/;
const STATUS = /^(?:has|is)[A-Z_]/;
const KEY_VALUE_CALLS = new Set(['kv', 'keyValue', 'value', 'append', 'entry', 'Pair']);
const CALL_BEFORE = /([A-Za-z_]\w*)\s*\(\s*$/;
const KEY_READ = /(?:\b(?:getenv|getProperty|get)\s*\(|\[)\s*$/;
const KEY_CLOSE = /^\s*[)\]]/;
const FORMAT_CALL = /\bformat\s*\(/g;
const KEY_READ_WINDOW = 32;
const KEY_CLOSE_WINDOW = 16;
const PAIRED_VALUE = /^\s*(to\b|,)\s*([A-Za-z_][\w.?!]*(?:\(\))?)/;

function nameOf(expression) {
  const text = expression.split('?:')[0].replaceAll(/\s+/g, '').replace(CONVERTED, '');
  if (!CHAIN.test(text)) {
    return undefined;
  }
  const bare = text.replace(/!+$/, '');
  const segments = bare.replace(/\(\)$/, '').split(/[?!]*\./);
  const name = segments.at(-1);
  const called = bare.endsWith('()');
  return (called && !GETTER.test(name)) || RECEIVER.test(segments[segments.length - 2] ?? '')
    ? undefined
    : name;
}

function isLogged({ name, key }) {
  return isSecretName(name) && !STATUS.test(name) && (key || !CONSTANT.test(name));
}

function directNames(scanned, argument) {
  const text = scanned.code.slice(argument.start, argument.end);
  const formatted = [...text.matchAll(FORMAT_CALL)].flatMap((match) => {
    const open = argument.start + match.index + match[0].length - 1;
    return splitArguments(scanned.code, open).parts.map((part) =>
      scanned.code.slice(part.start, part.end),
    );
  });
  return [...text.split('+'), ...formatted].map((piece) => ({ name: nameOf(piece), key: false }));
}

function templateNames(literals) {
  return literals
    .filter(({ template }) => template)
    .flatMap(({ text }) =>
      [...text.matchAll(TEMPLATE_REFERENCE)].map((match) => ({
        name: nameOf(match[1] ?? match[2]),
        key: false,
      })),
    );
}

function readKeys(scanned, literals) {
  return literals
    .filter(({ start }) =>
      KEY_READ.test(scanned.source.slice(Math.max(0, start - KEY_READ_WINDOW), start)),
    )
    .filter(({ end }) => KEY_CLOSE.test(scanned.source.slice(end, end + KEY_CLOSE_WINDOW)))
    .map(({ text }) => ({ name: text, key: true }));
}

function pairedKeys(scanned, argument, literals) {
  return literals
    .filter((key) => {
      const paired = PAIRED_VALUE.exec(scanned.code.slice(key.end, argument.end));
      const call = CALL_BEFORE.exec(scanned.code.slice(argument.start, key.start));
      const pairs = paired !== null && (paired[1] === 'to' || KEY_VALUE_CALLS.has(call?.[1]));
      return pairs && !STATUS.test(nameOf(paired[2]) ?? '');
    })
    .map(({ text }) => ({ name: text, key: true }));
}

function sinkKeys(scanned, sink) {
  const [key, value] = sink.arguments;
  const literal = key === undefined ? undefined : literalsWithin(scanned, key)[0];
  const name = value === undefined ? undefined : nameOf(scanned.code.slice(value.start, value.end));
  const named = literal !== undefined && name !== undefined && !STATUS.test(name);
  return sink.keyed && named ? [{ name: literal.text, key: true }] : [];
}

function argumentNames(scanned, argument) {
  const literals = literalsWithin(scanned, argument);
  return [
    ...directNames(scanned, argument),
    ...templateNames(literals),
    ...readKeys(scanned, literals),
    ...pairedKeys(scanned, argument, literals),
  ];
}

export function secretsInLogs(source) {
  const scanned = withLiteralIndex(source);
  return secretSinks(scanned.code).flatMap((sink) => {
    const names = [
      ...sink.arguments.flatMap((argument) => argumentNames(scanned, argument)),
      ...sinkKeys(scanned, sink),
    ];
    const secret = names.find((entry) => entry.name !== undefined && isLogged(entry));
    return secret === undefined
      ? []
      : [{ rule: 'SecretInLog', offset: sink.start, subject: secret.name }];
  });
}
