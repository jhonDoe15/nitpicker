import type { ModuleAlias } from '../typed/module-types.mts';

const REFERENCE = /\$(?:[$&`']|\d{1,2})/gu;

type Captures = {
  readonly match: string;
  readonly groups: readonly unknown[];
  readonly offset: number;
  readonly text: string;
};

function capturesOf(match: string, rest: readonly unknown[]): Captures {
  const at = rest.findIndex((value) => typeof value === 'number');
  const offset = rest[at];
  const text = rest[at + 1];
  return {
    match,
    groups: rest.slice(0, at),
    offset: typeof offset === 'number' ? offset : 0,
    text: typeof text === 'string' ? text : '',
  };
}

function groupAt(captures: Captures, digits: string): string | undefined {
  const index = Number(digits);
  if (index < 1 || index > captures.groups.length) {
    return undefined;
  }
  const group = captures.groups[index - 1];
  return typeof group === 'string' ? group : '';
}

function groupText(captures: Captures, digits: string): string | undefined {
  const whole = groupAt(captures, digits);
  if (whole !== undefined || digits.length === 1) {
    return whole;
  }
  const first = groupAt(captures, digits.slice(0, 1));
  return first === undefined ? undefined : `${first}${digits.slice(1)}`;
}

function referenced(captures: Captures, token: string): string {
  const reference = token.slice(1);
  const named: Readonly<Record<string, string>> = {
    $: '$',
    '&': captures.match,
    '`': captures.text.slice(0, captures.offset),
    "'": captures.text.slice(captures.offset + captures.match.length),
  };
  return named[reference] ?? groupText(captures, reference) ?? token;
}

export function aliasedSpecifier(aliases: readonly ModuleAlias[], specifier: string): string {
  const alias = aliases.find(({ find }) =>
    typeof find === 'string'
      ? specifier === find || specifier.startsWith(`${find}/`)
      : find.test(specifier),
  );
  if (alias === undefined) {
    return specifier;
  }
  return specifier.replace(alias.find, (match: string, ...rest: unknown[]) => {
    const captures = capturesOf(match, rest);
    return alias.replacement.replaceAll(REFERENCE, (token: string) => referenced(captures, token));
  });
}
