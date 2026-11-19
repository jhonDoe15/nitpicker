import { simpleCase } from './simple-case.mts';

const UTIL_LIST = 'java.util.List';

const CHECK = 'PlainTextRegex';
const PARAMETERS = 'List<String> out, String text, String value';

export const PLAIN_TEXT_CASES = [
  simpleCase({
    check: CHECK,
    name: 'PlainTextReplaced',
    imports: [UTIL_LIST, 'java.util.regex.Matcher'],
    importsAfter: [UTIL_LIST],
    members: [
      ['static final String SEPARATOR = "_";'],
      ['static final String ESCAPED = "a\\\\b";'],
    ],
    parameters: PARAMETERS,
    statements: [
      ['out.add(text.replaceAll("_", " "));', 'out.add(text.replace("_", " "));'],
      ['out.add(text.replaceAll(SEPARATOR, "-"));', 'out.add(text.replace(SEPARATOR, "-"));'],
      ['out.add(text.replaceAll("-", "\\\\\\\\"));', 'out.add(text.replace("-", "\\\\"));'],
      ['out.add(text.replaceAll("-", "\\\\$"));', 'out.add(text.replace("-", "$"));'],
      ['out.add(text.replaceAll("-", ESCAPED));', 'out.add(text.replace("-", "ab"));'],
      ['out.add(text.replaceAll("-", "tab\\there"));', 'out.add(text.replace("-", "tab\\there"));'],
      [
        'out.add(text.replaceAll("-", Matcher.quoteReplacement(value)));',
        'out.add(text.replace("-", value));',
      ],
      [
        'out.add(text.replaceAll("<", "").replaceAll(">", ""));',
        'out.add(text.replace("<", "").replace(">", ""));',
      ],
      [
        'out.add(\n  text.trim()\n      .replaceAll("a" + "b", "x"));',
        'out.add(\n  text.trim()\n      .replace("a" + "b", "x"));',
      ],
      ['out.add(text.replaceAll("", "-"));', 'out.add(text.replace("", "-"));'],
    ],
  }),
  simpleCase({
    check: CHECK,
    name: 'PlainTextKept',
    imports: [UTIL_LIST],
    members: [['static final String PATTERN = "x.y";']],
    parameters: PARAMETERS,
    statements: [
      ['out.add(text.replaceAll("-", value));'],
      ['out.add(text.replaceAll("-", "$1"));'],
      [`out.add(text.replaceAll("-", "\${name}"));`],
      ['out.add(text.replaceAll("-", "$"));'],
      ['out.add(text.replaceAll("-", "\\\\"));'],
      ['out.add(text.replaceAll("a.b", "x"));'],
      ['out.add(text.replaceAll(PATTERN, "x"));'],
      ['out.add(text.replaceAll("\\\\s", " "));'],
      ['out.add(text.replaceAll(value, "x"));'],
      ['out.add(text.replaceFirst("-", "x"));'],
    ],
  }),
];
