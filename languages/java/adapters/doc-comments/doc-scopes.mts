import { topLevelParts as splitTopLevel } from '../../source/frames/bracket-depths.mts';
import {
  descriptionLines as untypedDescriptionLines,
  tagsHaveContent as untypedTagsHaveContent,
} from '../../../../shared/rules/doc-comments/doc-comments.mjs';
import type {
  DocComment,
  DocCommentInput,
  DocEntry,
  Declared,
  Header,
  Pair,
  Scope,
  ScopeContext,
} from './doc-comment-types.mts';

type DeclarationRules = {
  readonly tokens: RegExp;
  readonly modifiers: ReadonlySet<string>;
  readonly startsAnnotationType: (code: string, at: number) => boolean;
  readonly skipAnnotation: (code: string, at: number) => number;
};
type FoundDeclaration = { readonly scope: Scope; readonly declared: Declared };

type TagOptions = { readonly blockTag: RegExp; readonly marker?: RegExp };

const descriptionLines: (text: string, options: TagOptions) => string[] = untypedDescriptionLines;
const tagsHaveContent: (text: string, options: TagOptions) => boolean = untypedTagsHaveContent;

export const IDENTIFIER = String.raw`[\p{L}_$][\p{L}\p{N}_$]*`;

const BLOCK_TAG = /^@[A-Za-z][\w-]*(?=[\s{[]|$)/u;
const NAME_AT_END = new RegExp(
  String.raw`(\x60[^\x60\n]+\x60|${IDENTIFIER})(?:\s*\[\s*\])*\s*$`,
  'u',
);
const ANGLES = /->|[<>]/gu;
const ANGLE_DEPTH: Readonly<Record<string, number>> = { '<': 1, '>': -1 };
const SPACE = /\S/gu;

export function matchesFrom(
  text: string,
  pattern: RegExp,
  from: number,
): IterableIterator<RegExpExecArray> {
  const marks = new RegExp(pattern.source, pattern.flags);
  marks.lastIndex = from;
  return text.matchAll(marks);
}

export function lineStarts(source: string): number[] {
  return [0, ...[...source.matchAll(/\n/gu)].map(({ index }) => index + 1)];
}

export function lineAt(starts: readonly number[], offset: number): number {
  return starts.findLastIndex((start) => start <= offset) + 1;
}

function closePair(pairs: readonly Pair[], open: number[], index: number): void {
  const pair = pairs[open.pop() ?? -1];
  if (pair !== undefined) {
    pair.close = index;
  }
}

export function bracePairs(code: string): Pair[] {
  const pairs: Pair[] = [];
  const open: number[] = [];
  for (const { index, 0: brace } of code.matchAll(/[{}]/gu)) {
    if (brace === '{') {
      pairs.push({ open: index, close: code.length, parent: open.at(-1) ?? -1 });
      open.push(pairs.length - 1);
    } else if (open.length > 0) {
      closePair(pairs, open, index);
    }
  }
  return pairs;
}

function ancestors(pairs: readonly Pair[], pair: number): number[] {
  const chain = pair < 0 ? [] : [pair];
  for (const current of chain) {
    const parent = pairs[current]?.parent ?? -1;
    chain.push(...(parent < 0 ? [] : [parent]));
  }
  return chain.toReversed();
}

function innermostPair(pairs: readonly Pair[], offset: number): number {
  const opened = pairs.findLastIndex(({ open }) => open < offset);
  return ancestors(pairs, opened).findLast((pair) => offset < (pairs[pair]?.close ?? 0)) ?? -1;
}

function scopeAt({ pairs, types }: ScopeContext, offset: number): Scope {
  const direct = innermostPair(pairs, offset);
  function openOf(pair: number): number {
    return pairs[pair]?.open ?? -1;
  }
  const chain = ancestors(pairs, direct)
    .map((pair) => types.get(openOf(pair))?.name)
    .filter((name) => name !== undefined);
  return {
    chain,
    type: direct < 0 ? undefined : types.get(openOf(direct)),
    declarable: direct < 0 || types.has(openOf(direct)),
  };
}

export function topLevelParts(text: string): string[] {
  return splitTopLevel(text, { openers: '([{<', closers: ')]}>', arrows: true });
}

export function closingAngle(code: string, open: number): number {
  let depth = 0;
  for (const { index, 0: mark } of matchesFrom(code, ANGLES, open)) {
    depth += ANGLE_DEPTH[mark] ?? 0;
    if (depth === 0) {
      return index;
    }
  }
  return code.length;
}

function escapeRegExp(characters: string): string {
  return characters.replaceAll(/[\\\]^-]/gu, String.raw`\$&`);
}

export function headerUntil(code: string, from: number, stops: string): Header {
  const marks = new RegExp(String.raw`->|[<>]|[${escapeRegExp(stops)}]`, 'gu');
  let depth = 0;
  for (const { index, 0: mark } of matchesFrom(code, marks, from)) {
    const change = ANGLE_DEPTH[mark];
    depth = Math.max(0, depth + (change ?? 0));
    if (change === undefined && mark !== '->' && depth === 0) {
      return { text: code.slice(from, index).trim(), stop: mark, at: index };
    }
  }
  return { text: code.slice(from).trim(), stop: '', at: code.length };
}

export function nameIndex(header: string): number {
  return NAME_AT_END.exec(header)?.index ?? header.length;
}

export function nameAtEnd(header: string): string | undefined {
  const match = NAME_AT_END.exec(header);
  return match === null ? undefined : match[1]?.replaceAll('`', '');
}

export function withoutGenerics(text: string): string {
  const versions = [text];
  for (const version of versions) {
    const next = version.replaceAll(/<[^<>]*>/gu, ' ');
    versions.push(...(next === version ? [] : [next]));
  }
  return versions.at(-1) ?? text;
}

export function skipSpace(code: string, from: number): number {
  const [found] = matchesFrom(code, SPACE, from);
  return found === undefined ? code.length : found.index;
}

export function declarationStartWith(code: string, from: number, rules: DeclarationRules): number {
  let skipUntil = from;
  for (const { index, 0: token } of matchesFrom(code, rules.tokens, from)) {
    if (index < skipUntil || rules.modifiers.has(token)) {
      continue;
    }
    if (token !== '@' || rules.startsAnnotationType(code, index)) {
      return index;
    }
    skipUntil = rules.skipAnnotation(code, index);
  }
  return code.length;
}

function declaredScope(
  context: ScopeContext,
  doc: { readonly start: number; readonly end: number },
  find: (scope: Scope) => Declared | undefined,
): FoundDeclaration | undefined {
  const scope = scopeAt(context, doc.start);
  const declared = scope.declarable ? find(scope) : undefined;
  return declared === undefined ? undefined : { scope, declared };
}

type EntryResolver = {
  readonly find: (scope: Scope) => Declared | undefined;
  readonly input: (found: FoundDeclaration) => DocCommentInput;
};

export function docEntries(
  context: ScopeContext,
  doc: { readonly start: number; readonly end: number },
  resolver: EntryResolver,
): DocEntry[] {
  const found = declaredScope(context, doc, resolver.find);
  if (found === undefined) {
    return [];
  }
  return [{ span: { start: doc.start, end: doc.end }, comment: docComment(resolver.input(found)) }];
}

function docComment({ text, marker, line, declared, chain }: DocCommentInput): DocComment {
  const options: TagOptions =
    marker === undefined ? { blockTag: BLOCK_TAG } : { blockTag: BLOCK_TAG, marker };
  const qualified = [...chain, declared.receiver, declared.name]
    .filter((part) => part !== undefined)
    .join('.');
  return {
    line,
    name: declared.name,
    qualifier:
      declared.parameters === undefined ? qualified : `${qualified}(${declared.parameters})`,
    lines: descriptionLines(text, options),
    detailed: tagsHaveContent(text, options),
  };
}
