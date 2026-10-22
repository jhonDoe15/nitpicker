import { logCalls } from '../../log-calls.mjs';
import { isSecretName } from './secret-names.mjs';

const TEMPLATE_REFERENCE = /\$(?:\{([^{}]*)\}|([A-Za-z_]\w*))/g;
const CHAIN = /^[A-Za-z_]\w*(?:[?!]*\.[A-Za-z_]\w*)*(?:\(\))?!*$/;
const CONVERTED = /\.(?:toString|toCharArray)\(\)$/;
const GETTER = /^get(?:Password|Secret|Token|ApiKey|PrivateKey|Credentials?)$/;
const CONSTANT = /^[A-Z][A-Z0-9_]*$/;
const STATUS = /^(?:has|is)[A-Z_]/;
const KEY_VALUE_CALLS = new Set(['kv', 'keyValue', 'value', 'append', 'entry', 'Pair']);
const CALL_BEFORE = /([A-Za-z_]\w*)\s*\(\s*$/;

function lastName(expression) {
  const text = expression.replaceAll(/\s+/g, '').replace(CONVERTED, '');
  if (!CHAIN.test(text)) {
    return undefined;
  }
  const bare = text.replace(/!+$/, '');
  const name = bare.replace(/\(\)$/, '');
  const last = name.split(/[?!]*\./).at(-1);
  return name !== bare && !GETTER.test(last) ? undefined : last;
}

function isLoggedSecret(name) {
  const isGetter = GETTER.test(name);
  const secret = isGetter || isSecretName(name);
  return secret && !STATUS.test(name) && !CONSTANT.test(name);
}

function directNames(scanned, argument) {
  const text = scanned.code.slice(argument.start, argument.end);
  return text.split('+').map((piece) => lastName(piece));
}

function templateNames(scanned, argument) {
  return scanned.literals
    .filter(({ start, end }) => start >= argument.start && end <= argument.end)
    .flatMap(({ text }) =>
      [...text.matchAll(TEMPLATE_REFERENCE)].map((match) => lastName(match[1] ?? match[2])),
    );
}

function isKeyOfValue(scanned, argument, key) {
  const after = /^\s*(to\b|,)\s*[A-Za-z_]/.exec(scanned.code.slice(key.end, argument.end));
  if (after === null) {
    return false;
  }
  const call = CALL_BEFORE.exec(scanned.code.slice(argument.start, key.start));
  return after[1] === 'to' || KEY_VALUE_CALLS.has(call?.[1]);
}

function keyedNames(scanned, argument) {
  return scanned.literals
    .filter(({ start, end }) => start >= argument.start && end <= argument.end)
    .filter((key) => isKeyOfValue(scanned, argument, key))
    .map(({ text }) => text);
}

export function secretsInLogs(scanned) {
  return logCalls(scanned.code, { console: true }).flatMap((call) => {
    const message =
      call.lambda === undefined ? [] : [{ start: call.lambda.open + 1, end: call.lambda.close }];
    const names = [...call.arguments, ...message].flatMap((argument) => [
      ...directNames(scanned, argument),
      ...templateNames(scanned, argument),
      ...keyedNames(scanned, argument),
    ]);
    const secret = names.find((name) => name !== undefined && isLoggedSecret(name));
    return secret === undefined
      ? []
      : [{ rule: 'SecretInLog', offset: call.start, subject: secret }];
  });
}
