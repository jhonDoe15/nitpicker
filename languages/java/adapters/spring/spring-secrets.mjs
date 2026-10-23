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
const KEY_OWNER_WORDS = new Set([
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
const PLACEHOLDER = /^\$\{[^}:]*(?::(.*))?\}$/;
const ENUM_WORD = /^[a-z]+(?:[-_][a-z]+)*$/;
const NOT_LITERAL = [
  /^(?:null|~)$/i,
  /^(?:true|false|on|off|yes|no)$/i,
  /^[+-]?\d+(?:\.\d+)?$/,
  /^\*[\w-]+$/,
  /^@[^@\s]+@$/,
  /^ENC\(.*\)$/,
  /^\{(?:cipher|bcrypt|pbkdf2|scrypt|argon2|sha256)\}/,
  /^#\{/,
  /^(?:classpath\*?|file):/i,
];
const URL_PASSWORD = /:\/\/[^/\s:@]*:([^@\s/]+)@/;
const URL_PARAMETER =
  /[?&;][\w.-]*(?:password|pwd|passwd|secret|token|api[-_]?key|access[-_]?key)=([^&;\s]+)/i;
const URL_KEY_PARAMETER = /[?&;]key=([\w-]{20,})(?:[&;\s]|$)/;
const ORACLE_LOGIN = /^jdbc:oracle:\w+:@?[^/@\s:]+\/([^@\s]+)@/i;
const URL_TEMPLATE = /^(?:\{[^}]*\}|%[a-z]|<[^>]*>)$/i;
const ALGORITHM = /^(?:[A-Z]{2,6}\d{0,4}|[A-Z]+(?:_[A-Z]+)+)$/;

function keyWords(key) {
  const segments = key.split('.');
  const words = segmentWords(segments.pop());
  if (words.length === 1 && words[0] === 'key' && segments.length > 0) {
    const owner = segmentWords(segments.at(-1)).at(-1);
    return KEY_OWNER_WORDS.has(owner) ? [owner, 'key'] : words;
  }
  return words;
}

function segmentWords(segment) {
  return segment
    .replaceAll(/\[\d+\]/g, '')
    .replaceAll(/([a-z\d])([A-Z])/g, '$1-$2')
    .replaceAll(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase()
    .split(/[-_]+/)
    .filter((word) => word !== '');
}

function endsWithSecretWord(words) {
  return SECRET_WORDS.has(words.at(-1)) || SECRET_WORDS.has(words.slice(-2).join(''));
}

export function isSecretKey(key) {
  return endsWithSecretWord(keyWords(key));
}

export function placeholderDefault(value) {
  const pending = [value];
  for (const text of pending) {
    const placeholder = PLACEHOLDER.exec(text);
    if (placeholder !== null) {
      pending.push(placeholder[1] ?? '');
    }
  }
  return pending.at(-1);
}

function isLiteralValue(value, isLabel) {
  const text = placeholderDefault(value);
  if (text === '' || text.startsWith('${') || NOT_LITERAL.some((pattern) => pattern.test(text))) {
    return false;
  }
  return !(isLabel && (ENUM_WORD.test(text) || ALGORITHM.test(text)));
}

export function isLiteralSecret(key, value) {
  const words = keyWords(key);
  const ownerKey = segmentWords(key.split('.').at(-1)).join('-') === 'key';
  return (
    endsWithSecretWord(words) && isLiteralValue(value.trim(), ownerKey || words.at(-1) === 'token')
  );
}

export function secretVariable(key) {
  return key
    .replaceAll(/\[\d+\]/g, '')
    .replaceAll('-', '')
    .replaceAll('.', '_')
    .toUpperCase();
}

export function credentialUrl(value) {
  const text = placeholderDefault(value.trim());
  return [URL_PASSWORD, URL_PARAMETER, URL_KEY_PARAMETER, ORACLE_LOGIN].some((pattern) => {
    const secret = pattern.exec(text)?.[1];
    return secret !== undefined && !secret.startsWith('${') && !URL_TEMPLATE.test(secret);
  });
}
