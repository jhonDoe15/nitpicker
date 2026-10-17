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

export function holdsOnlyPublicValues(content) {
  return content
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .every((line) => {
      const name = ASSIGNMENT.exec(line)?.[1];
      return name !== undefined && PUBLIC_PREFIXES.some((prefix) => name.startsWith(prefix));
    });
}
