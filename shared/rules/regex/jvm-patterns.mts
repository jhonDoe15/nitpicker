const JVM_FLAGS = new Map<string, string>([
  ['CASE_INSENSITIVE', 'i'],
  ['IGNORE_CASE', 'i'],
  ['MULTILINE', 'm'],
  ['DOTALL', 's'],
  ['DOT_MATCHES_ALL', 's'],
  ['UNICODE_CASE', ''],
  ['0', ''],
]);
const SEPARATORS = /\bsetOf\s*\(|\boptions?\s*=(?!=)|[(),|]|\bor\b/gu;
const QUALIFIER = /^(?:[\w$]+\.)*/u;

export function jvmPatternFlags(options: readonly string[]): string | undefined {
  const names = options
    .join(',')
    .replaceAll(SEPARATORS, ' ')
    .split(/\s+/u)
    .filter((name: string) => name !== '')
    .map((name: string) => name.replace(QUALIFIER, ''));
  const flags = names.map((name) => JVM_FLAGS.get(name));
  return flags.includes(undefined) ? undefined : [...new Set(flags)].join('');
}

export const JVM_REGEX_RULES = { part: 'RegexPartDefect', backtracking: 'BacktrackingRegex' };
