const DEV_WORDS = [
  'dev',
  'devel',
  'develop',
  'development',
  'test',
  'tests',
  'testing',
  'lint',
  'linting',
  'docs?',
  'typing',
  'types',
  'ci',
  'tox',
  'checks?',
  'qa',
  'format',
  'local',
  'style',
  'coverage',
];
const DEV_NAME = new RegExp(`(?:^|[-_.])(?:${DEV_WORDS.join('|')})(?:$|[-_.])`, 'u');
const REQUIREMENT_NAME = /^\s*([A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?)/u;
const EGG_NAME = /[#&]egg=([A-Za-z0-9][A-Za-z0-9._-]*)/u;
const EDITABLE = /^-e(?:\s+|(?=\S))/u;
const URL_START = /^[a-z][a-z0-9+.-]*:\/\//iu;

export function normalizeRequirementName(name) {
  return name.toLowerCase().replaceAll(/[-_.]+/gu, '-');
}

export function requirementName(line) {
  const text = line
    .replace(/\s+#.*$/u, '')
    .trim()
    .replace(EDITABLE, '');
  if (text === '' || text.startsWith('#') || text.startsWith('-')) {
    return undefined;
  }
  const egg = EGG_NAME.exec(text)?.[1];
  if (egg !== undefined) {
    return egg;
  }
  if (URL_START.test(text) || text.startsWith('.') || text.startsWith('/')) {
    return undefined;
  }
  return REQUIREMENT_NAME.exec(text)?.[1];
}

export function isDevelopmentGroup(name) {
  return DEV_NAME.test(String(name).toLowerCase());
}

export function dependencyEntry(name, group, file) {
  return { name, normalized: normalizeRequirementName(name), group, file };
}

export function requirementEntries(list, group, file) {
  return (Array.isArray(list) ? list : [])
    .filter((line) => typeof line === 'string')
    .map(requirementName)
    .filter((name) => name !== undefined)
    .map((name) => dependencyEntry(name, group, file));
}

export function groupOf(name, fallback) {
  return isDevelopmentGroup(name) ? 'dev' : fallback;
}
