import { readFileSync } from 'node:fs';
import { containedPath } from '../../../../../core/fix/tool-steps/paths/contained-path.mts';
import type { Finding } from '../../../adapters/static-checks/shared.mts';
import { RULE_IDS, exceptionMatcher, exceptionText } from '../typed/rule-views.mts';
import type { StructureLayout, StructurePolicy } from '../typed/structure-types.mts';

const RULE = RULE_IDS.minifiedSourceFile;
const SOURCE_EXTENSION = /\.[cm]?[jt]sx?$/u;
const DECLARATION_EXTENSION = /\.d\.[cm]?ts$/u;
const MIN_FILE_LENGTH = 10_000;
const MIN_AVERAGE_LINE_LENGTH = 500;
const MIN_DOMINANT_LINE_LENGTH = 8_000;
const MIN_DOMINANT_LINE_RATIO = 0.7;
const MIN_STRIPPED_LENGTH = 2_500;
const MIN_STRIPPED_RATIO = 0.25;
const MIN_SYNTAX_TOKENS = 10;
const MIN_PUNCTUATION_COUNT = 80;

const STRING_LITERAL = /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/gu;
const KEYWORDS =
  'var|let|const|return|if|for|while|switch|try|catch|throw|typeof|instanceof|new|void|delete';
const EXECUTABLE_SYNTAX = new RegExp(
  `function\\s*\\(|=>|&&|\\|\\||===|!==|\\b(?:${KEYWORDS})\\b\\s*[(a-zA-Z0-9_\${[!]`,
  'gu',
);
const CODE_PUNCTUATION = /[;{}()]/gu;

function countMatches(text: string, pattern: RegExp): number {
  let count = 0;
  for (const _ of text.matchAll(pattern)) {
    count += 1;
  }
  return count;
}

function hasMinifiedLineShape(text: string): boolean {
  const nonEmpty = text.split(/\r?\n/u).filter((line) => line.trim().length > 0);
  if (nonEmpty.length === 0) {
    return false;
  }
  const nonEmptyChars = nonEmpty.reduce((sum, line) => sum + line.length, 0);
  const maxLineLength = nonEmpty.reduce((best, line) => Math.max(best, line.length), 0);
  const highAverage = nonEmptyChars / nonEmpty.length >= MIN_AVERAGE_LINE_LENGTH;
  const dominantLine =
    maxLineLength >= MIN_DOMINANT_LINE_LENGTH &&
    maxLineLength / text.length >= MIN_DOMINANT_LINE_RATIO;
  return highAverage || dominantLine;
}

function hasMinifiedCodeSyntax(text: string): boolean {
  const stripped = text.replace(STRING_LITERAL, '""');
  if (stripped.length < MIN_STRIPPED_LENGTH || stripped.length / text.length < MIN_STRIPPED_RATIO) {
    return false;
  }
  return (
    countMatches(stripped, EXECUTABLE_SYNTAX) >= MIN_SYNTAX_TOKENS &&
    countMatches(stripped, CODE_PUNCTUATION) >= MIN_PUNCTUATION_COUNT
  );
}

export function isMinifiedSourceText(text: string): boolean {
  return (
    text.length >= MIN_FILE_LENGTH && hasMinifiedLineShape(text) && hasMinifiedCodeSyntax(text)
  );
}

function isSourceCodeFile(file: string): boolean {
  return SOURCE_EXTENSION.test(file) && !DECLARATION_EXTENSION.test(file);
}

function minifiedMessage(file: string): string {
  return (
    `${file} looks like a minified bundle inside a source root, which slows down analysis and hides unreviewed code. ` +
    'Move it out of the source root, load it as a dependency, or exclude it in the layout. ' +
    `If this is intended, add ${exceptionText(RULE, file)} to "exceptions" in nitpicker.config.json.`
  );
}

function readSourceText(projectRoot: string, file: string): string {
  return readFileSync(containedPath(projectRoot, file), 'utf8');
}

export function minifiedSourceFindings({
  projectRoot,
  analyzerName,
  layout,
  policy,
}: {
  readonly projectRoot: string;
  readonly analyzerName: string;
  readonly layout: StructureLayout;
  readonly policy: StructurePolicy;
}): Finding[] {
  const isExcepted = exceptionMatcher(policy.exceptions);
  return layout
    .projectCodeFiles(projectRoot, layout.sourceRoots)
    .filter(
      (file) =>
        isSourceCodeFile(file) &&
        !layout.isExcluded(file) &&
        !layout.isTestFixture(file) &&
        !isExcepted(RULE, file) &&
        isMinifiedSourceText(readSourceText(projectRoot, file)),
    )
    .map((file): Finding => ({
      tool: analyzerName,
      rule: RULE,
      path: file,
      identity: RULE,
      location: { line: 1 },
      message: minifiedMessage(file),
      classification: 'enforceable',
    }));
}
