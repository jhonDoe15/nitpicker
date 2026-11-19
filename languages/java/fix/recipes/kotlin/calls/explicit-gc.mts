import { kotlinRecipe } from '../shared/kotlin-recipe.mts';
import { closingIndex, enclosingOpen, matchingOpenParen } from '../shared/kotlin-scan.mts';
import type { KotlinFound, ScannedKotlin } from '../shared/kotlin-scan.mts';
import { removalSpan } from '../shared/spans.mts';

const COLLECTION =
  /(?<![\w.$`])(?:java\.lang\.)?(?:(System)\s*\.\s*gc|(Runtime)\s*\.\s*getRuntime\s*\(\s*\)\s*\.\s*gc)\s*\(\s*\)/gu;
const SHADOWING_IMPORT = /\bimport\s+(?!java\.lang\.)[\w.]*\.(System|Runtime)\b/gu;
const SHADOWING_TYPE = /\b(?:object|class|interface)\s+(System|Runtime)\b/gu;
const CONTINUING_LINE = /^[.?:&|=<>,+\-*/%]/u;
const CONTINUING_WORD = /^(?:else|catch|finally|as|is|in)\b/u;
const STATEMENT_ENDS = /[\w)\]"'}{;]/u;
const OPEN_KEYWORD = /\b(?:else|do|try|finally|return|throw|in|is|as|if|while|for|when)$/u;
const CONTROL_HEADER = /\b(?:if|for|while|when|catch)\s*$/u;
const FUNCTION_HEADER = /(?<![\w.])fun\s/u;

function shadowedNames(source: string): ReadonlySet<string> {
  const found = [...source.matchAll(SHADOWING_IMPORT), ...source.matchAll(SHADOWING_TYPE)];
  return new Set(found.map((match) => match[1] ?? ''));
}

function startsStatement(code: string, start: number): boolean {
  const before = code.slice(0, start).trimEnd();
  const previous = before.at(-1);
  if (previous === undefined || !STATEMENT_ENDS.test(previous) || before.endsWith('->')) {
    return false;
  }
  if (previous === ')') {
    const head = code.slice(0, matchingOpenParen(code, before.length - 1)).trimEnd();
    return !(CONTROL_HEADER.test(head) || /@\w+$/u.test(head));
  }
  return !OPEN_KEYWORD.test(before);
}

function lineRest(code: string, from: number): { readonly end: number; readonly blank: boolean } {
  const newline = code.indexOf('\n', from);
  const end = newline === -1 ? code.length : newline;
  return { end, blank: code.slice(from, end).trim() === '' };
}

function continuesNextLine(code: string, from: number): boolean {
  const next = code.slice(from).trimStart();
  return CONTINUING_LINE.test(next) || CONTINUING_WORD.test(next);
}

function headerOf(code: string, open: number): string {
  const boundary = Math.max(
    code.lastIndexOf(';', open),
    code.lastIndexOf('{', open - 1),
    code.lastIndexOf('}', open),
  );
  return code.slice(boundary + 1, open);
}

function leavesBlockUsable(code: string, from: number): boolean {
  const open = enclosingOpen(code, from);
  if (open === -1) {
    return false;
  }
  return (
    FUNCTION_HEADER.test(headerOf(code, open)) ||
    code.slice(from, closingIndex(code, open)).trim() !== ''
  );
}

function trailingComment({ comments, source }: ScannedKotlin, from: number, end: number): number {
  const comment = comments.find((entry) => entry.start >= from && entry.start < end);
  return comment !== undefined && source.startsWith('//', comment.start) ? comment.end : from;
}

function standalone(scanned: ScannedKotlin, start: number, end: number): number | undefined {
  const { code } = scanned;
  if (!startsStatement(code, start)) {
    return undefined;
  }
  let stop = end;
  const spaces = /^[ \t]*;?/u.exec(code.slice(end))?.[0] ?? '';
  stop += spaces.length;
  const rest = lineRest(code, stop);
  const closes = code.slice(stop, rest.end).trimStart().startsWith('}');
  if (!(rest.blank || closes || spaces.includes(';'))) {
    return undefined;
  }
  if (rest.blank && continuesNextLine(code, rest.end)) {
    return undefined;
  }
  const after = rest.blank ? trailingComment(scanned, stop, rest.end) : stop;
  return leavesBlockUsable(code, Math.max(stop, after)) ? Math.max(stop, after) : undefined;
}

function explicitCollections(scanned: ScannedKotlin): KotlinFound[] {
  const shadowed = shadowedNames(scanned.source);
  return [...scanned.code.matchAll(COLLECTION)].flatMap(({ index, 0: call, 1: system }) => {
    if (shadowed.has(system === undefined ? 'Runtime' : 'System')) {
      return [];
    }
    const end = standalone(scanned, index, index + call.length);
    return end === undefined
      ? []
      : [
          {
            rule: 'detekt.potential-bugs.ExplicitGarbageCollectionCall',
            offset: index,
            edits: [{ ...removalSpan(scanned.source, index, end), text: '' }],
          },
        ];
  });
}

export const explicitGcRecipe = kotlinRecipe({
  id: 'kotlin-explicit-gc-call',
  safety: 'review',
  rules: [{ tool: 'detekt', rule: 'detekt.potential-bugs.ExplicitGarbageCollectionCall' }],
  where: 'both',
  find: explicitCollections,
});
