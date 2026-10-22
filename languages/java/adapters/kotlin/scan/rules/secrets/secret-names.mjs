import {
  SECRET_NAME_WORDS,
  SECRET_VALUE_SUFFIXES,
} from '../../../../../../../shared/naming/secret-words.mjs';

const SECRET_NAME = new RegExp(`(?:${SECRET_NAME_WORDS.join('|')})$`);
const VALUE_SUFFIXES = new Set(SECRET_VALUE_SUFFIXES);
const WORD_BOUNDARIES = [/([a-z0-9])([A-Z])/g, /([A-Z]+)([A-Z][a-z])/g];
const MIN_SECRET_LENGTH = 6;
const MIN_CHARACTER_CLASSES = 3;
const NOT_A_SECRET = [
  /\s/,
  /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//,
  /^(?:[A-Z][A-Z0-9_]+|[A-Za-z]+(?:[_.:/-][A-Za-z]+)+|\*+|x+|<.*>|\[.*\]|\$\{.*\})$/,
  /^(?:changeme|change-me|todo|example|dummy|placeholder|redacted|none|null|undefined|your[-_ ].*)$/i,
];

export const SECRET_MESSAGES = {
  HardcodedSecret:
    'Read it from the environment or a secrets manager and inject it: this variable holds a hardcoded secret.',
  CredentialLiteral:
    'Read it from the environment or a secrets manager: this string looks like a credential (access key, token, private key, or a password in a URL).',
  SecretInLog: 'Log that the secret is set, or a masked tail, instead of the secret itself.',
};

function wordsOf(name) {
  const spaced = WORD_BOUNDARIES.reduce((text, boundary) => text.replace(boundary, '$1 $2'), name);
  return spaced
    .split(/[^A-Za-z0-9]+/)
    .filter((word) => word !== '')
    .map((word) => word.toLowerCase());
}

export function lettersOf(name) {
  return wordsOf(name)
    .join('')
    .replaceAll(/[^a-z]/g, '');
}

export function isSecretName(name) {
  const words = wordsOf(name);
  while (words.length > 1 && VALUE_SUFFIXES.has(words.at(-1))) {
    words.pop();
  }
  return SECRET_NAME.test(words.join('').replaceAll(/[^a-z]/g, ''));
}

export function looksSecret(text, name) {
  if (text.length < MIN_SECRET_LENGTH || NOT_A_SECRET.some((pattern) => pattern.test(text))) {
    return false;
  }
  if (lettersOf(text) === lettersOf(name)) {
    return false;
  }
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((pattern) => pattern.test(text));
  return (/\d/.test(text) && /[A-Za-z]/.test(text)) || classes.length >= MIN_CHARACTER_CLASSES;
}
