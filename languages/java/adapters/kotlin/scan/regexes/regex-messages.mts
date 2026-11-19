export const UNQUOTED_RULE = 'UnquotedRegexValue';
export const PLAIN_RULE = 'PlainTextRegex';

export const REGEX_MESSAGES = {
  [UNQUOTED_RULE]:
    'Escape the value before it goes into the pattern (`Regex("^/$' +
    '{Regex.escape(name)}/\\\\d+$")`, `Pattern.quote(name)` for `Pattern.compile`), match plain text with `contains`, `startsWith` or `split(value)`, or pass a value that is meant as a whole pattern to `Regex(pattern)` on its own. A runtime value built into this regex unescaped changes the pattern when it holds a `.`, `|`, `$` or another metacharacter.',
  [PLAIN_RULE]:
    'Pass the text itself: `replace("\\r", "")`, `replaceFirst`, `split(",")` and `contains("x")` take plain text in Kotlin. This regex has no metacharacters, so compiling it only costs time and makes a `$` in the replacement a group reference.',
};
