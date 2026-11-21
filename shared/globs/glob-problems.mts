function hasUnclosedBrace(glob: string): boolean {
  let depth = 0;
  let escaped = false;
  for (const character of glob) {
    if (escaped) {
      escaped = false;
    } else if (character === '\\') {
      escaped = true;
    } else if (character === '{') {
      depth += 1;
    } else if (character === '}' && depth > 0) {
      depth -= 1;
    }
  }
  return depth > 0;
}

type GlobProblem =
  | { readonly pattern: RegExp; readonly problem: string; readonly matches?: undefined }
  | {
      readonly matches: (glob: string) => boolean;
      readonly problem: string;
      readonly pattern?: undefined;
    };

export const GLOB_PROBLEMS: readonly GlobProblem[] = [
  {
    pattern: /^\.\//u,
    problem: 'drop the leading "./": globs match from the project root',
  },
  { pattern: /\/$/u, problem: 'drop the trailing "/": write {fix}' },
  {
    pattern: /\(\?/u,
    problem:
      'regular expression flags such as (?i) are not supported: globs match case-sensitively, so list each spelling in braces, such as {README,readme}.md',
  },
  { matches: hasUnclosedBrace, problem: 'a "{" is never closed' },
];

export function globProblem(glob: string): string | undefined {
  return GLOB_PROBLEMS.find(({ pattern, matches }) =>
    pattern === undefined ? matches(glob) : pattern.test(glob),
  )?.problem;
}
