const SECRET_WORDS = new Set([
  'password',
  'secret',
  'token',
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
const URL_PARAMETER = /[?&;](?:password|pwd|passwd|secret|token|api-?key|access-?key)=([^&;\s]+)/i;

function keyWords(key) {
  const segments = key.split('.');
  const words = segmentWords(segments.at(-1));
  if (words.length === 1 && words[0] === 'key' && segments.length > 1) {
    const owner = segmentWords(segments.at(-2)).at(-1);
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

function placeholderDefault(value) {
  const pending = [value];
  for (const text of pending) {
    const placeholder = PLACEHOLDER.exec(text);
    if (placeholder !== null) {
      pending.push(placeholder[1] ?? '');
    }
  }
  return pending.at(-1);
}

function isLiteralValue(value, isToken) {
  const text = placeholderDefault(value);
  if (text === '' || text.startsWith('${') || NOT_LITERAL.some((pattern) => pattern.test(text))) {
    return false;
  }
  return !(isToken && ENUM_WORD.test(text));
}

export function isLiteralSecret(key, value) {
  const words = keyWords(key);
  return endsWithSecretWord(words) && isLiteralValue(value.trim(), words.at(-1) === 'token');
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
  return [URL_PASSWORD, URL_PARAMETER].some((pattern) => {
    const secret = pattern.exec(text)?.[1];
    return secret !== undefined && !secret.startsWith('${');
  });
}
