const MIN_PLURAL_LENGTH = 3;
const SUFFIXES = /(?:repository|repo|entity|model|table|schema|dao)$/u;

export function tableKey(name) {
  if (typeof name !== 'string' || name === '') {
    return undefined;
  }
  const bare = name
    .split('.')
    .at(-1)
    .split(/\s+as\s+/iu)[0]
    .trim();
  const lowered = bare.replaceAll(/[^A-Za-z0-9]/gu, '').toLowerCase();
  const stripped = lowered.replace(SUFFIXES, '');
  const singular =
    stripped.endsWith('s') && stripped.length > MIN_PLURAL_LENGTH
      ? stripped.slice(0, -1)
      : stripped;
  return singular === '' ? undefined : singular;
}
