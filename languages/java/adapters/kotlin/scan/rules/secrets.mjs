import { literalAt } from '../kotlin-source.mjs';
import { logCalls } from '../log-calls.mjs';

const SECRET_WORDS = [
  'password',
  'passwd',
  'pwd',
  'passphrase',
  'secret',
  'token',
  'credentials?',
  'apikey',
  'privatekey',
  'accesskey',
  'secretkey',
  'authkey',
  'signingkey',
  'encryptionkey',
];
const SECRET_NAME = new RegExp(`(?:${SECRET_WORDS.join('|')})$`);
const MIN_SECRET_LENGTH = 6;
const MIN_CHARACTER_CLASSES = 3;
const ASSIGNED = /(?<![\w.])([A-Za-z_]\w*)(?:\s*:\s*[\w.<>?]+)?\s*=(?!=)\s*"/g;
const KEYED = /"\s*(?:,|\bto\b)\s*"/g;
const NOT_A_SECRET = [
  /\s/,
  /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//,
  /^(?:[A-Z][A-Z0-9_]+|[A-Za-z]+(?:[_.:/-][A-Za-z]+)+|\*+|x+|<.*>|\[.*\]|\$\{.*\})$/,
  /^(?:changeme|change-me|todo|example|dummy|placeholder|redacted|none|null|undefined|your[-_ ].*)$/i,
];
const CREDENTIAL = [
  /AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{30,}|xox[abprs]-[A-Za-z0-9-]{10,}/,
  /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/,
  /[rs]k_(?:live|test)_[A-Za-z0-9]{20,}|sk-(?:proj|ant|live|test)-[A-Za-z0-9_-]{20,}/,
  /^[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s/@${}]{6,}@/i,
  /[?&;]password=[^&;\s${}]{6,}/i,
  /^(?:Bearer|Basic) [A-Za-z0-9._~+/=-]{16,}$/,
];
const TEMPLATE_REFERENCE = /\$(?:\{\s*([A-Za-z_]\w*)\s*\}|([A-Za-z_]\w*)(?![\w.(]))/g;
const CONSTANT = /^[A-Z][A-Z0-9_]*$/;

export const SECRET_MESSAGES = {
  HardcodedSecret:
    'Read it from the environment or a secrets manager and inject it: this variable holds a hardcoded secret.',
  CredentialLiteral:
    'Read it from the environment or a secrets manager: this string looks like a credential (access key, token, private key, or a password in a URL).',
  SecretInLog: 'Log that the secret is set, or a masked tail, instead of the secret itself.',
};

function isSecretName(name) {
  return SECRET_NAME.test(name.replaceAll(/[^A-Za-z]/g, '').toLowerCase());
}

function looksSecret(literal) {
  const text = literal.text.replaceAll('\\$', '$');
  if (
    literal.template ||
    text.length < MIN_SECRET_LENGTH ||
    NOT_A_SECRET.some((pattern) => pattern.test(text))
  ) {
    return false;
  }
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((pattern) => pattern.test(text));
  return (/\d/.test(text) && /[A-Za-z]/.test(text)) || classes.length >= MIN_CHARACTER_CLASSES;
}

function secretFinding(literal, name) {
  return looksSecret(literal)
    ? [{ rule: 'HardcodedSecret', offset: literal.start, subject: name }]
    : [];
}

export function hardcodedSecrets(scanned) {
  const assigned = [...scanned.code.matchAll(ASSIGNED)].flatMap((match) => {
    const literal = literalAt(scanned, match.index + match[0].length - 1);
    return literal !== undefined && isSecretName(match[1]) ? secretFinding(literal, match[1]) : [];
  });
  const keyed = [...scanned.code.matchAll(KEYED)].flatMap(({ index, 0: text }) => {
    const key = scanned.literals.find(({ end }) => end === index + 1);
    const value = literalAt(scanned, index + text.length - 1);
    return key !== undefined && value !== undefined && isSecretName(key.text)
      ? secretFinding(value, key.text)
      : [];
  });
  return [...assigned, ...keyed];
}

export function credentialLiterals(scanned) {
  return scanned.literals
    .filter(({ text }) => CREDENTIAL.some((pattern) => pattern.test(text)))
    .map(({ start }) => ({ rule: 'CredentialLiteral', offset: start }));
}

function isLoggedSecret(name) {
  return isSecretName(name) && !/^(?:has|is)[A-Z_]/.test(name) && !CONSTANT.test(name);
}

function referencedNames(scanned, argument) {
  const text = scanned.code.slice(argument.start, argument.end);
  const direct = text
    .split('+')
    .map((piece) => piece.trim())
    .filter((piece) => /^[A-Za-z_]\w*$/.test(piece));
  const templated = scanned.literals
    .filter(({ start, end }) => start >= argument.start && end <= argument.end)
    .flatMap(({ text: body }) => [...body.matchAll(TEMPLATE_REFERENCE)].map((m) => m[1] ?? m[2]));
  return [...direct, ...templated];
}

export function secretsInLogs(scanned) {
  return logCalls(scanned.code, { console: true }).flatMap((call) => {
    const message =
      call.lambda === undefined ? [] : [{ start: call.lambda.open + 1, end: call.lambda.close }];
    const names = [...call.arguments, ...message].flatMap((argument) =>
      referencedNames(scanned, argument),
    );
    const secret = names.find(isLoggedSecret);
    return secret === undefined
      ? []
      : [{ rule: 'SecretInLog', offset: call.start, subject: secret }];
  });
}
