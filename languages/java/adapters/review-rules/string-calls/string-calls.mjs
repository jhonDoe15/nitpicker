import { readFileSync } from 'node:fs';
import { findingFactory } from '../../kotlin/review-rules/review-finding.mjs';
import { pathInside, projectSourceFiles } from '../java-sources.mjs';
import { parseSource } from '../max-value-sums/source-file.mjs';
import { findUnescapedMarkup } from './html/markup.mjs';
import { findExpandingReplacements } from './replacements/replacements.mjs';
import { findTranslations } from './translation/chains.mjs';

export const PATTERN_TRANSLATION_RULE = 'PatternTranslation';
export const EXPANDING_REPLACEMENT_RULE = 'ExpandingReplacement';
export const UNESCAPED_HTML_RULE = 'UnescapedHtmlValue';
const STRING_CALL_RULES = [
  PATTERN_TRANSLATION_RULE,
  EXPANDING_REPLACEMENT_RULE,
  UNESCAPED_HTML_RULE,
];
export const STRING_CALL_EXCEPTION_RULES = STRING_CALL_RULES.map((rule) => `pmd/${rule}`);

function translationMessage({ kind, root }) {
  const target = kind === 'like' ? 'a SQL `LIKE` pattern' : 'a regular expression';
  const escape =
    kind === 'like'
      ? 'escape `%`, `_` and the escape character first and add an `ESCAPE` clause'
      : 'escape the value first (`Pattern.quote(value)` or `Regex.escape(value)`) and restore the wildcards from their escaped form';
  return (
    `\`${root}\` is turned into ${target} by \`replace\` calls that leave the target's metacharacters ` +
    `unescaped, so a \`.\`, \`$\` or \`%\` in it changes what matches: ${escape}, or tokenise the pattern and map each token.`
  );
}

function replacementMessage({ value, kotlin }) {
  const form = kotlin
    ? '`Regex.escapeReplacement(value)`, or the lambda overload `regex.replace(text) { value }`'
    : '`Matcher.quoteReplacement(value)`, or `String.replace(CharSequence, CharSequence)`, which is literal';
  return (
    `The replacement \`${value}\` is built at run time and read as a template: \`$1\`, \`\${name}\` and a backslash in it ` +
    `are expanded or throw instead of being inserted. Use ${form}.`
  );
}

function markupMessage({ value }) {
  return (
    `The value \`${value}\` is put into an HTML string as it is, so a \`<\`, \`&\` or quote in it breaks the markup ` +
    'or injects a tag. Escape it first (`HtmlUtils.htmlEscape`, `StringEscapeUtils.escapeHtml4`, `Encode.forHtml`, ' +
    'Kotlin `kotlinx.html`), or build the page with a template engine that escapes.'
  );
}

function translationFindings(finding, source) {
  return findTranslations(source).map(({ kind, line, root, method }) =>
    finding({
      rule: PATTERN_TRANSLATION_RULE,
      file: source.file,
      line,
      symbol: root,
      key: `${source.file}:${method}:${kind}:${root}`,
      message: translationMessage({ kind, root }),
    }),
  );
}

function replacementFindings(finding, source) {
  return findExpandingReplacements(source).map(({ line, method, value, owner }) =>
    finding({
      rule: EXPANDING_REPLACEMENT_RULE,
      file: source.file,
      line,
      symbol: value,
      key: `${source.file}:${owner}:${method}:${value}`,
      message: replacementMessage({ value, kotlin: source.kotlin }),
    }),
  );
}

function markupFindings(finding, source) {
  return findUnescapedMarkup(source).map(({ line, value, owner }) =>
    finding({
      rule: UNESCAPED_HTML_RULE,
      file: source.file,
      line,
      symbol: value,
      key: `${source.file}:${owner}:${value}`,
      message: markupMessage({ value }),
    }),
  );
}

function sourceFindings(finding, source) {
  return [
    ...translationFindings(finding, source),
    ...replacementFindings(finding, source),
    ...markupFindings(finding, source),
  ];
}

export function readStringCallFindings(projectRoot, { projects, kotlin = false, policy = {} }) {
  const files = [
    ...projectSourceFiles(projectRoot, { projects, kotlin, exclude: policy.exclude ?? [] }).keys(),
  ];
  const finding = findingFactory();
  return files.flatMap((file) =>
    sourceFindings(
      finding,
      parseSource(readFileSync(pathInside(projectRoot, file), 'utf8'), {
        file,
        kotlin: file.endsWith('.kt'),
      }),
    ),
  );
}

const PLACEHOLDER_VALUE = '<value>';

export const PATTERN_TRANSLATION_ALLOWED = translationMessage({
  kind: 'regex',
  root: PLACEHOLDER_VALUE,
});

export const EXPANDING_REPLACEMENT_ALLOWED = replacementMessage({
  value: PLACEHOLDER_VALUE,
  kotlin: false,
});

export const UNESCAPED_HTML_ALLOWED = markupMessage({ value: PLACEHOLDER_VALUE });
