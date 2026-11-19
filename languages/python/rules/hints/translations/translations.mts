import { RULES_TOOL } from '../tool.mts';
import type { RuleHint } from '../hint-types.mts';

const BEFORE = 'before';
const PREFIX_LENGTH = { missing: 'missing:'.length, unused: 'unused:'.length };

function listed(problems: readonly string[], kind: 'missing' | 'unused'): string {
  return problems
    .filter((problem) => problem.startsWith(`${kind}:`))
    .map((problem) => `\`${problem.slice(PREFIX_LENGTH[kind])}\``)
    .join(', ');
}

function gettextDescribe(subject: string): string {
  const [method = '', ...problems] = subject.split('|');
  if (problems[0] === BEFORE) {
    return `\`${method}\` fills the text before the translation lookup, so the lookup uses the filled-in text, never finds the message id and the text is never translated`;
  }
  const missing = listed(problems, 'missing');
  const unused = listed(problems, 'unused');
  const parts = [
    ...(missing === ''
      ? []
      : [
          `the translated text needs ${missing}, which \`${method}\` does not give, so it raises at run time`,
        ]),
    ...(unused === '' ? [] : [`${unused} fills no placeholder of the text`]),
  ];
  return `The arguments of \`${method}\` do not fit the placeholders of the translated text: ${parts.join('; ')}`;
}

export const TRANSLATION_HINTS: readonly RuleHint[] = [
  {
    tool: RULES_TOOL,
    rules: ['gettext-format-mismatch'],
    describe: gettextDescribe,
    allowed:
      'Format after the translation lookup and give each placeholder its name: `_("Visit {location}").format(location=place)`, `_("Failed: {messages}").format(messages=text)`.',
  },
  {
    tool: 'ruff',
    rules: ['INT001', 'INT002', 'INT003'],
    allowed:
      'Translate the plain text first and format the result: `_("Hello {name}").format(name=name)` or `_("Hello %s") % name`.',
  },
];
