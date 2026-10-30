import { RULES_TOOL } from '../tool.mjs';

const OWNED_MUTATION = /^(.+) \((.+)\)$/u;
const ALIAS = /^(\S+) = (\S+)$/u;

function mutationDescription(subject = '') {
  const [, mutation, owner] = OWNED_MUTATION.exec(subject) ?? [];
  return owner === undefined
    ? `\`${subject}\` changes the argument the caller passed in`
    : `\`${mutation}\` changes the argument the caller passed to \`${owner}\``;
}

function shimDescription(subject = '') {
  if (subject === '__getattr__') {
    return 'A module `__getattr__` keeps names that were removed or renamed working';
  }
  if (subject.startsWith('warnings.warn')) {
    return 'A deprecation warning keeps an old call working next to its replacement';
  }
  if (subject.startsWith('@deprecated ')) {
    return `\`${subject.slice('@deprecated '.length)}\` is kept as a deprecated name next to its replacement`;
  }
  const [, alias, target] = ALIAS.exec(subject) ?? [];
  return alias === undefined
    ? `\`${subject}\` keeps an old name working`
    : `\`${alias}\` is an alias that keeps the old name of \`${target}\` working`;
}

export const SIGNATURE_HINTS = [
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
];
