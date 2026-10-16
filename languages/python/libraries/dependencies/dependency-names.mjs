const REQUIREMENT_NAME = /^([A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?)/u;
const EGG_NAME = /[#&]egg=([A-Za-z0-9][A-Za-z0-9._-]*)/u;
const DEVELOPMENT_WORDS = [
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
  'qa',
  'checks?',
  'style',
  'tox',
  'coverage',
];
const DEVELOPMENT_GROUP = new RegExp(
  `(?:^|[-_.])(?:${DEVELOPMENT_WORDS.join('|')})(?:$|[-_.])`,
  'iu',
);
const EDITABLE = /^-e(?:\s+|(?=\S))/u;

export function normalizeRequirementName(name) {
  return name.toLowerCase().replaceAll(/[-_.]+/gu, '-');
}

export function isDevelopmentGroup(name) {
  return DEVELOPMENT_GROUP.test(name);
}

export function requirementName(line) {
  const text = line
    .replace(/\s+#.*$/u, '')
    .trim()
    .replace(EDITABLE, '');
  if (text === '' || text.startsWith('#') || text.startsWith('-')) {
    return undefined;
  }
  const egg = EGG_NAME.exec(text);
  if (egg !== null) {
    return normalizeRequirementName(egg[1]);
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//iu.test(text) || text.startsWith('.') || text.startsWith('/')) {
    return undefined;
  }
  const match = REQUIREMENT_NAME.exec(text);
  return match === null ? undefined : normalizeRequirementName(match[1]);
}

export function namesOf(requirements) {
  return (Array.isArray(requirements) ? requirements : [])
    .filter((entry) => typeof entry === 'string')
    .map(requirementName)
    .filter((name) => name !== undefined);
}

export function groupKind(group) {
  return isDevelopmentGroup(group) ? 'development' : 'runtime';
}
