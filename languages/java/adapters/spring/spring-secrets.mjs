const SECRET_WORDS = new Set([
  'password',
  'secret',
  'token',
  'credentials',
  'apikey',
  'privatekey',
  'secretkey',
  'accesskey',
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
];

function keyWords(key) {
  return key
    .split('.')
    .at(-1)
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
