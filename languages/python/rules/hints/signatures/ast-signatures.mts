import { RULES_TOOL } from '../tool.mts';
import type { RuleHint } from '../hint-types.mts';

const OWNED_MUTATION = /^(.+) \((.+)\)$/u;
const ALIAS = /^(\S+) = (\S+)$/u;
const TRANSLATED = /^(regex|like)\|(.*)$/u;

function translationDescription(subject = ''): string {
  const [, kind, value = subject] = TRANSLATED.exec(subject) ?? [];
  const target = kind === 'like' ? 'a SQL `LIKE` pattern' : 'a regular expression';
  return `\`${value}\` is turned into ${target} by \`replace\` calls that leave the target's metacharacters unescaped`;
}

function mutationDescription(subject = ''): string {
  const [, mutation = '', owner] = OWNED_MUTATION.exec(subject) ?? [];
  return owner === undefined
    ? `\`${subject}\` changes the argument the caller passed in`
    : `\`${mutation}\` changes the argument the caller passed to \`${owner}\``;
}

function shimDescription(subject = ''): string {
  if (subject === '__getattr__') {
    return 'A module `__getattr__` keeps names that were removed or renamed working';
  }
  if (subject.startsWith('warnings.warn')) {
    return 'A deprecation warning keeps an old call working next to its replacement';
  }
  if (subject.startsWith('@deprecated ')) {
    return `\`${subject.slice('@deprecated '.length)}\` is kept as a deprecated name next to its replacement`;
  }
  const [, alias, target = ''] = ALIAS.exec(subject) ?? [];
  return alias === undefined
    ? `\`${subject}\` keeps an old name working`
    : `\`${alias}\` is an alias that keeps the old name of \`${target}\` working`;
}

export const SIGNATURE_HINTS: readonly RuleHint[] = [
  {
    tool: RULES_TOOL,
    rules: ['tri-state-boolean'],
    describe: (subject) => `\`${subject}\` is a boolean that can also be \`None\`, a third state`,
    allowed:
      'Name the three states with an enum (`class Consent(Enum)` with `GRANTED`, `DENIED` and `UNKNOWN`), or take a keyword-only `bool` with a default (`*, urgent: bool = False`) when `None` only means false. A method that overrides a base class takes `@typing.override` and keeps the base signature.',
  },
  {
    tool: RULES_TOOL,
    rules: ['falsy-default'],
    describe: (subject) =>
      `\`${subject}\` replaces a falsy argument with a default, so \`0\`, \`""\`, \`[]\` and \`False\` count as not given`,
    allowed:
      'Test for `None` only: `limit if limit is not None else DEFAULT_LIMIT`, or `if limit is None: limit = DEFAULT_LIMIT`.',
  },
  {
    tool: RULES_TOOL,
    rules: ['number-truthiness'],
    describe: (subject) =>
      `\`${subject}\` is a number tested for truth, so \`0\` reads as false or missing`,
    allowed:
      'Compare the number: `count > 0`, `count != 0`, `index != -1`; test an optional number with `count is not None`, and default it with `count if count is not None else DEFAULT`. An exception fits only when `0` must take the same path as a missing value.',
  },
  {
    tool: RULES_TOOL,
    rules: ['presence-truthiness'],
    describe: (subject) =>
      `\`${subject}\` is an optional string or boolean tested for truth, so \`''\` or \`False\` reads as missing`,
    allowed:
      'Test for `None` only: `name is not None`, `name if name is not None else DEFAULT`. An exception fits only when an empty string or `False` must take the same path as a missing value.',
  },
  {
    tool: RULES_TOOL,
    rules: ['untrimmed-request-text'],
    describe: (subject) =>
      `\`${subject}\` is request text that reaches a lookup without \`strip()\`, so a padded value finds nothing`,
    allowed:
      'Strip it before the lookup: `name = name.strip()`, or declare the request model with `model_config = ConfigDict(str_strip_whitespace=True)` (on a shared base model) or `StringConstraints(strip_whitespace=True)` on the field.',
  },
  {
    tool: RULES_TOOL,
    rules: ['parameter-mutation'],
    describe: mutationDescription,
    allowed:
      'Build and return a new value (`[*items, item]`, `{**table, key: value}`), or copy the argument first (`items = [*items]`) when the function needs a working copy; do not hand a result back through a parameter.',
  },
  {
    tool: RULES_TOOL,
    rules: ['compatibility-shim'],
    describe: shimDescription,
    allowed:
      'When code moves or is renamed, change every caller in the same change and delete the old name: keep no alias, forwarding function, module `__getattr__`, `@deprecated` marker or deprecation warning. A published library keeps the deprecation of its public names, and that path takes an exception.',
  },
  {
    tool: RULES_TOOL,
    rules: ['pattern-translation'],
    describe: translationDescription,
    allowed:
      'Escape the value for the target language first (`re.escape(value)`, or `%`, `_` and the escape character for `LIKE`) and restore the wildcards from their escaped form (`\\*` to `.*`), tokenise the pattern and map each token, or use `fnmatch.translate`. A `.` in a configured glob then matches only a dot.',
  },
  {
    tool: RULES_TOOL,
    rules: ['expanding-replacement'],
    describe: (subject) =>
      `The replacement \`${subject}\` is built at run time, and \`re.sub\` reads \`\\1\`, \`\\g<name>\` and backslash escapes in it`,
    allowed:
      'Pass a function: `re.sub(pattern, lambda _: value, text)` inserts the value as it is. A constant template such as `r"\\1b"` is fine.',
  },
  {
    tool: RULES_TOOL,
    rules: ['unescaped-html-value'],
    describe: (subject) => `The value \`${subject}\` goes into an HTML string without escaping`,
    allowed:
      'Escape it first (`html.escape(value)`, `markupsafe.escape(value)`) or build the page with a template engine that escapes, so a `<`, `&` or quote in the value cannot break the markup.',
  },
];
