import { readFileSync } from 'node:fs';
import { findingFactory } from '../../kotlin/review-rules/review-finding.mjs';
import { pathInside, projectSourceFiles } from '../java-sources.mjs';
import { parseSource } from '../max-value-sums/source-file.mjs';
import { findTranslations } from './translation/chains.mjs';

export const PATTERN_TRANSLATION_RULE = 'PatternTranslation';
export const STRING_CALL_RULES = [PATTERN_TRANSLATION_RULE];
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

function sourceFindings(finding, source) {
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

export const PATTERN_TRANSLATION_ALLOWED = translationMessage({ kind: 'regex', root: '<value>' });
