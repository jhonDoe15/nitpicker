import {
  discoverSuites,
  scanTestFile,
} from '../../../../adapters/kotlin/review-rules/tests/discovery/test-units.mts';
import { importsOf } from '../../../../adapters/kotlin/review-rules/tests/discovery/imports.mts';
import { retriesInTests } from '../../../../adapters/kotlin/review-rules/tests/honesty/retries/retry-tests.mts';
import type { TestScanned } from '../../../../adapters/kotlin/review-rules/tests/typed/discovery-types.mts';
import { kotlinRecipe } from '../shared/kotlin-recipe.mts';
import { closingIndex, escapeRegExp, splitArguments } from '../shared/kotlin-scan.mts';
import type { KotlinEdit, KotlinFound } from '../shared/kotlin-scan.mts';
import { removalSpan } from '../shared/spans.mts';

const RULE = 'RetryInTest';
const JUPITER_TEST = 'org.junit.jupiter.api.Test';
const RETRY_NAMES = new Set(['RetryingTest', 'RepeatedIfExceptionsTest']);
const ANNOTATION = /^@([\w.]+)\s*(\()?/u;
const RETRIES_ARGUMENT = /^retries\s*=/u;
const RETRY_ANALYZER_ARGUMENT = /^retryAnalyzer\s*=/u;
const CONFIG_CALL = /^[^{}\n]*?\.\s*config\s*\(|^\s*\.\s*config\s*\(/u;
const EXISTING_TEST =
  /(?<![\w.])@(?:org\.junit\.jupiter\.api\.)?(?:Test|ParameterizedTest|RepeatedTest|TestFactory|TestTemplate)\b/u;
const RETRY_COUNT = /^(?:(?:value|maxAttempts|repeats)\s*=\s*)?\d+$/u;
const CONTINUATION = /[-+*/=,.]\s*$/u;
const CONTINUES_BELOW = /^\s*[-.=+]|^\s*get\b/u;
const LOOKAHEAD = 40;
const ANNOTATION_LINE = /^[ \t]*@/u;

type Located = { readonly key: string; readonly offset: number };

function lineBounds(text: string, offset: number): { start: number; end: number } {
  const newline = text.indexOf('\n', offset);
  return {
    start: text.lastIndexOf('\n', offset - 1) + 1,
    end: newline === -1 ? text.length : newline,
  };
}

type Drop = {
  readonly code: string;
  readonly open: number;
  readonly wanted: RegExp;
  readonly bare: boolean;
};

function dropArgument({ code, open, wanted, bare }: Drop): KotlinEdit | undefined {
  const { close, parts } = splitArguments(code, open);
  const trimmed = parts.map(({ start, end }) => ({
    start: start + (code.slice(start, end).length - code.slice(start, end).trimStart().length),
    end: start + code.slice(start, end).trimEnd().length,
  }));
  const index = trimmed.findIndex(({ start, end }) => wanted.test(code.slice(start, end)));
  const part = trimmed[index];
  if (part === undefined) {
    return undefined;
  }
  if (trimmed.length === 1) {
    return bare
      ? { start: open, end: close + 1, text: '' }
      : { start: open + 1, end: close, text: '' };
  }
  const next = trimmed[index + 1];
  const previous = trimmed[index - 1];
  return next === undefined
    ? { start: previous?.end ?? part.start, end: part.end, text: '' }
    : { start: part.start, end: next.start, text: '' };
}

function contiguous(lines: string[]): string[] {
  const stop = lines.findIndex((line) => !ANNOTATION_LINE.test(line));
  return stop === -1 ? lines : lines.slice(0, stop);
}

function siblingAnnotations(source: string, offset: number, last: number): string[] {
  const { start, end } = lineBounds(source, offset);
  const own = `${source.slice(start, offset)} ${source.slice(last, end)}`;
  const before = source.slice(0, start).split('\n').toReversed().slice(1);
  const after = source.slice(end + 1).split('\n');
  return [own, ...contiguous(before), ...contiguous(after)];
}

function importRemoval(
  scanned: TestScanned,
  name: string,
  found: readonly Located[],
): KotlinEdit[] {
  const { source } = scanned;
  const lines = [
    ...source.matchAll(
      new RegExp(`^[ \\t]*import[ \\t]+[\\w.]*\\.${escapeRegExp(name)}[ \\t]*$`, 'gmu'),
    ),
  ];
  const uses = [...source.matchAll(new RegExp(`\\b${escapeRegExp(name)}\\b`, 'gu'))].length;
  const [line] = lines;
  const annotated = found.filter(({ offset }) => source.startsWith(`@${name}`, offset)).length;
  return line === undefined || uses !== annotated + 1
    ? []
    : [{ ...removalSpan(source, line.index, line.index + line[0].length), text: '' }];
}

type Parsed = { readonly name: string; readonly open: number; readonly end: number };

function parseAnnotation(code: string, offset: number): Parsed | undefined {
  const match = ANNOTATION.exec(code.slice(offset));
  const name = match?.[1];
  if (match === null || name === undefined) {
    return undefined;
  }
  const open = match[2] === undefined ? -1 : offset + match[0].length - 1;
  const end = open === -1 ? offset + match[0].trimEnd().length : closingIndex(code, open) + 1;
  return { name, open, end };
}

function replaceRetry(
  scanned: TestScanned,
  parsed: Parsed,
  context: { readonly offset: number; readonly found: readonly Located[] },
): KotlinEdit[] {
  const { code, source } = scanned;
  const { name, open, end } = parsed;
  const { offset, found } = context;
  const argumentText = open === -1 ? '' : code.slice(open + 1, end - 1).trim();
  if (!RETRY_COUNT.test(argumentText) && argumentText !== '') {
    return [];
  }
  const hasTest = siblingAnnotations(source, offset, end).some((line) => EXISTING_TEST.test(line));
  const replacement =
    importsOf(scanned).explicit.get('Test') === JUPITER_TEST ? '@Test' : `@${JUPITER_TEST}`;
  const edit = hasTest
    ? { ...removalSpan(source, offset, end), text: '' }
    : { start: offset, end, text: replacement };
  const firstUse = found.find((entry) => source.startsWith(`@${name}`, entry.offset));
  const cleanup = firstUse?.offset === offset ? importRemoval(scanned, name, found) : [];
  return [edit, ...cleanup];
}

function annotationEdits(
  scanned: TestScanned,
  offset: number,
  found: readonly Located[],
): KotlinEdit[] {
  const { code } = scanned;
  const parsed = parseAnnotation(code, offset);
  if (parsed === undefined) {
    return [];
  }
  const target =
    importsOf(scanned).aliases.get(parsed.name)?.target ?? parsed.name.split('.').at(-1);
  if (RETRY_NAMES.has(target ?? '')) {
    return replaceRetry(scanned, parsed, { offset, found });
  }
  const { open } = parsed;
  const argument =
    open === -1
      ? undefined
      : dropArgument({ code, open, wanted: RETRY_ANALYZER_ARGUMENT, bare: true });
  return argument === undefined ? [] : [argument];
}

function statementEdits(scanned: TestScanned, offset: number): KotlinEdit[] {
  const { code, source } = scanned;
  const { end } = lineBounds(source, offset);
  const semicolon = code.indexOf(';', offset);
  const stop = semicolon !== -1 && semicolon < end ? semicolon + 1 : end;
  const statement = code.slice(offset, stop);
  const indented = source.slice(lineBounds(source, offset).start, offset).trim() === '';
  const opened = [...statement.matchAll(/[({[]/gu)].length;
  const closed = [...statement.matchAll(/[)}\]]/gu)].length;
  const continued =
    CONTINUATION.test(statement) || CONTINUES_BELOW.test(code.slice(end + 1, end + LOOKAHEAD));
  return indented && opened === closed && !continued
    ? [{ ...removalSpan(source, offset, stop), text: '' }]
    : [];
}

function callEdits(scanned: TestScanned, offset: number, pattern: RegExp): KotlinEdit[] {
  const { code } = scanned;
  const match = pattern.exec(code.slice(offset));
  if (match === null) {
    return [];
  }
  const argument = dropArgument({
    code,
    open: offset + match[0].length - 1,
    wanted: RETRIES_ARGUMENT,
    bare: false,
  });
  return argument === undefined ? [] : [argument];
}

const CONSTRUCTOR = /^[\w.]+\s*\(/u;

function editsFor(
  scanned: TestScanned,
  { key, offset }: Located,
  found: readonly Located[],
): KotlinEdit[] {
  const kind = key.slice(key.lastIndexOf(':') + 1);
  if (kind === 'annotation') {
    return annotationEdits(scanned, offset, found);
  }
  if (kind === 'retries') {
    return statementEdits(scanned, offset);
  }
  if (kind === 'testConfig') {
    return callEdits(scanned, offset, CONSTRUCTOR);
  }
  return kind === 'config' ? callEdits(scanned, offset, CONFIG_CALL) : [];
}

export const kotlinRetryInTestRecipe = kotlinRecipe({
  id: 'kotlin-retry-in-test',
  rules: [{ tool: 'pmd', rule: RULE }],
  safety: 'review',
  where: 'test',
  find(_, { text }): KotlinFound[] {
    const scanned = scanTestFile(text);
    if (scanned === undefined) {
      return [];
    }
    const found = retriesInTests(scanned, discoverSuites(scanned)).toSorted(
      (left, right) => left.offset - right.offset,
    );
    return found.flatMap((entry) => {
      const edits = editsFor(scanned, entry, found);
      return edits.length === 0 ? [] : [{ offset: entry.offset, edits }];
    });
  },
});
