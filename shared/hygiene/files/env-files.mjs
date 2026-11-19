import {
  hasCredentialShape,
  isSecretName,
  looksLikeSecretValue,
  wordsOf,
} from '../../naming/secret-words.mjs';

const TEMPLATE_WORDS = new Set(['example', 'sample', 'template', 'dist', 'default', 'defaults']);
const ENVIRONMENT_NAMES =
  /^env\.(?:local|dev|development|prod|production|stage|staging|test|qa|uat|preview)$/iu;
const PUBLIC_PREFIXES = [
  'VITE_',
  'NEXT_PUBLIC_',
  'NUXT_PUBLIC_',
  'EXPO_PUBLIC_',
  'PUBLIC_',
  'REACT_APP_',
  'VUE_APP_',
  'GATSBY_',
];
const PLACEHOLDER_VALUE =
  /^(?:changeme|change-me|todo|example|dummy|placeholder|redacted|your[-_ ].*|x+|\*+)$/iu;
const SOURCE_FILE = /\.(?:[cm]?[jt]sx?|py|java|kt|go|rb|rs)$/iu;
const ASSIGNMENT = /^(?:export\s+)?([A-Za-z_][\w.-]*)\s*=/u;

export function isEnvFileName(base) {
  const isEnv =
    base === '.env' ||
    base === '.envrc' ||
    base.startsWith('.env.') ||
    base.startsWith('.env-') ||
    base.endsWith('.env') ||
    ENVIRONMENT_NAMES.test(base);
  return isEnv && !SOURCE_FILE.test(base) && !isTemplate(base);
}

function isTemplate(base) {
  const segments = base.toLowerCase().split(/[.-]/u);
  const named = segments.at(-1) === 'env' ? segments.slice(0, -1) : segments;
  return TEMPLATE_WORDS.has(named.at(-1) ?? '');
}

const REFERENCE_SCHEMES =
  /^(?:ref\+[a-z0-9]+:|vault:|op:\/\/|secretsmanager:|ssm:|awssecrets:|gcpsecrets:|azurekeyvault:|ENC\[|sops:|<.*>$)/iu;
const VARIABLE_REFERENCE = /^\$\{[^}]+\}$|^\$[A-Za-z_][A-Za-z0-9_]*$/u;
const EMPTY_USER_URL = /^[a-z][a-z0-9+.-]*:\/\/[^\s/:@]*:([^\s/@]+)@/iu;
const SECRET_LAST_WORDS = new Set(['pass', 'pwd', 'jwt', 'private', 'credential', 'credentials']);

function isReference(value) {
  return REFERENCE_SCHEMES.test(value) || VARIABLE_REFERENCE.test(value);
}

function namesSecret(name) {
  return isSecretName(name) || SECRET_LAST_WORDS.has(wordsOf(name).at(-1) ?? '');
}

function hasEmbeddedSecret(value) {
  const password = EMPTY_USER_URL.exec(value)?.[1];
  return password !== undefined && looksLikeSecretValue(password);
}

function valueOf(rest) {
  const text = rest.trim();
  const quote = /^(["'])(.*?)\1/u.exec(text);
  return (quote === null ? text.replace(/\s+#.*$/u, '') : quote[2]).trim();
}

function isHarmless(name, value) {
  if (value === '' || isReference(value) || PLACEHOLDER_VALUE.test(value)) {
    return true;
  }
  return !(namesSecret(name) || hasCredentialShape(value) || hasEmbeddedSecret(value));
}

export function holdsNoSecrets(content) {
  return content
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .every((line) => {
      const match = ASSIGNMENT.exec(line);
      if (match === null) {
        return false;
      }
      const name = match[1];
      return (
        PUBLIC_PREFIXES.some((prefix) => name.startsWith(prefix)) ||
        isHarmless(name, valueOf(line.slice(match[0].length)))
      );
    });
}
