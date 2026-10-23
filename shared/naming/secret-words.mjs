export const SECRET_NAME_WORDS = [
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
  'hmackey',
  'jwtkey',
];

export const SECRET_VALUE_SUFFIXES = ['value', 'raw', 'str', 'string', 'text', 'plain'];

export const MARKER_TOKEN_WORDS = ['eos', 'bos', 'pad', 'unk', 'cls', 'sep', 'mask'];

export const PASSPHRASE_NAME_WORDS = ['password', 'passwd', 'passphrase'];

export const SECRET_VALUE_LENGTH = 6;

export const SECRET_CHARACTER_CLASSES = 3;

export const PASSPHRASE_LENGTH = 8;

export const PLACEHOLDER_PATTERNS = [
  String.raw`\*+\w{0,4}`,
  'x+',
  '<.*>',
  String.raw`\[.*\]`,
  String.raw`\$\{.*\}`,
  String.raw`\$[A-Za-z_]\w*`,
  String.raw`\{\{.*\}\}`,
  String.raw`\{\w*\}`,
  '%s',
  String.raw`%\(\w+\)s`,
  ':[A-Za-z_]+',
  'changeme',
  'change-me',
  'todo',
  'example',
  'dummy',
  'placeholder',
  'redacted',
  'none',
  'null',
  'undefined',
  'your[-_ ].*',
];

export const NOT_SECRET_PATTERNS = [
  '[A-Z][A-Z0-9_]+',
  '[A-Za-z]+(?:[._:/-][A-Za-z]+)+',
  '[a-z][a-z0-9_-]*(?:[./][a-z0-9_-]+)+',
  String.raw`(?:~|\.{1,2})?(?:/[\w.-]+)+/?`,
  String.raw`\^.*\$`,
];

export const IDENTIFIER_PATTERNS = [
  '[a-z][a-z0-9]*(?:[_-][a-z0-9]+)+',
  '[a-z]+(?:[A-Z][a-z0-9]*)+',
];

export const CREDENTIAL_SHAPES = [
  String.raw`\bAKIA[0-9A-Z]{16}\b`,
  String.raw`\bgh[pousr]_[A-Za-z0-9]{30,}`,
  String.raw`\bxox[abprs]-[A-Za-z0-9-]{10,}`,
  '-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----',
  String.raw`\b[rs]k_(?:live|test)_[A-Za-z0-9]{20,}`,
  String.raw`\bsk-(?:proj|ant|live|test)-[A-Za-z0-9_-]{20,}`,
  String.raw`\bdjango-insecure-\S{6,}`,
];

export const EMBEDDED_SECRET_PATTERNS = [
  String.raw`^[a-z][a-z0-9+.-]*://[^\s/:@]+:([^\s/@]+)@`,
  String.raw`^(?:bearer|basic|token)\s+(\S+)$`,
  String.raw`[?&;]password=([^&;\s]+)`,
];

const WORD_BOUNDARIES = [/([a-z0-9])([A-Z])/g, /([A-Z]+)([A-Z][a-z])/g];
const SECRET_NAME = new RegExp(`(?:${SECRET_NAME_WORDS.join('|')})$`);
const SECRET_WORD = new RegExp(SECRET_NAME_WORDS.join('|'));
const PASSPHRASE_NAME = new RegExp(`(?:${PASSPHRASE_NAME_WORDS.join('|')})$`);
const PLACEHOLDER = new RegExp(`^(?:${PLACEHOLDER_PATTERNS.join('|')})$`, 'i');
const NOT_SECRET = new RegExp(`^(?:${NOT_SECRET_PATTERNS.join('|')})$`);
const IDENTIFIER = new RegExp(`^(?:${IDENTIFIER_PATTERNS.join('|')})$`);
const CREDENTIALS = CREDENTIAL_SHAPES.map((shape) => new RegExp(shape));
const EMBEDDED = EMBEDDED_SECRET_PATTERNS.map((shape) => new RegExp(shape, 'i'));
const URL_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
const CHARACTER_CLASSES = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/];
const MARKER_TOKENS = new Set(MARKER_TOKEN_WORDS);
const VALUE_SUFFIXES = new Set(SECRET_VALUE_SUFFIXES);

export function wordsOf(name) {
  const spaced = WORD_BOUNDARIES.reduce((text, boundary) => text.replace(boundary, '$1 $2'), name);
  return spaced
    .split(/[^A-Za-z0-9]+/)
    .filter((word) => word !== '')
    .map((word) => word.toLowerCase());
}

function nameWords(name) {
  const words = wordsOf(name);
  const kept = words.findLastIndex((word) => !VALUE_SUFFIXES.has(word)) + 1;
  return words.slice(0, Math.max(1, kept));
}

function joinedLetters(words) {
  return words.join('').replaceAll(/\d/g, '');
}

export function isSecretName(name) {
  const words = nameWords(name);
  const marker = words.at(-1) === 'token' && MARKER_TOKENS.has(words.at(-2));
  return !marker && SECRET_NAME.test(joinedLetters(words));
}

function isCandidate(text) {
  return !/\s/.test(text) && !PLACEHOLDER.test(text) && !NOT_SECRET.test(text);
}

export function looksLikeSecretValue(text) {
  if (text.length < SECRET_VALUE_LENGTH || !isCandidate(text)) {
    return false;
  }
  const classes = CHARACTER_CLASSES.filter((pattern) => pattern.test(text)).length;
  return (/\d/.test(text) && /[A-Za-z]/.test(text)) || classes >= SECRET_CHARACTER_CLASSES;
}

export function hasCredentialShape(text) {
  if (CREDENTIALS.some((shape) => shape.test(text))) {
    return true;
  }
  return EMBEDDED.some((shape) => {
    const secret = shape.exec(text)?.[1];
    return secret !== undefined && looksLikeSecretValue(secret);
  });
}

function isPassphrase(text, name) {
  const long = text.length >= PASSPHRASE_LENGTH && /[a-z][A-Z]/.test(text);
  return long && isCandidate(text) && PASSPHRASE_NAME.test(joinedLetters(nameWords(name)));
}

function namesASecret(text, name) {
  const words = wordsOf(text);
  const named = IDENTIFIER.test(text) && SECRET_WORD.test(joinedLetters(words));
  return named || words.join('') === wordsOf(name).join('');
}

export function isHardcodedSecret(text, name) {
  if (hasCredentialShape(text) || URL_SCHEME.test(text) || namesASecret(text, name)) {
    return false;
  }
  return looksLikeSecretValue(text) || isPassphrase(text, name);
}
