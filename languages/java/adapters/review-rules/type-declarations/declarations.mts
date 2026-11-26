import { appendAll } from '../../../../../shared/lists/lists.mts';
import type { BareSource, SourceFile, Span } from '../max-value-sums/sum-types.mts';
import {
  angleStep,
  forward,
  parseSource,
  splitTopLevel,
} from '../max-value-sums/source/source-file.mts';
import { blankLiterals, importsOf, mainSourceTexts, packageOf } from '../java-sources.mts';
import type { MainSourceOptions } from '../java-sources.mts';
import { memberAt, textAt } from './members.mts';
import type { Member } from './members.mts';
import type { FieldDecl, FileContext, MethodDecl, TypeDecl, TypeKind } from './types.mts';

const EXTENDS = 'extends';
const IMPLEMENTS = 'implements';
const PERMITS = 'permits';
const HEADER_WORDS = new Set([EXTENDS, IMPLEMENTS, PERMITS]);

type Header = {
  readonly superclass: string | undefined;
  readonly interfaces: readonly string[];
  readonly open: number;
};

function qualifiedName(source: BareSource, span: Span): string {
  const { tokens } = source;
  const generic = tokens.slice(span.from, span.to).findIndex(({ text }) => text === '<');
  const end = generic === -1 ? span.to : span.from + generic;
  const last = tokens.slice(span.from, end).findLastIndex(({ kind }) => kind === 'identifier');
  const parts = [span.from + last];
  for (const at of parts) {
    if (at - 2 >= span.from && textAt(tokens, at - 1) === '.') {
      parts.push(at - 2);
    }
  }
  return last === -1
    ? ''
    : parts
        .map((at) => textAt(tokens, at))
        .toReversed()
        .join('.');
}

function namesIn(source: BareSource, span: Span): string[] {
  return splitTopLevel(source, span)
    .map((part) => qualifiedName(source, part))
    .filter((name) => name !== '');
}

function markersOf(
  source: BareSource,
  keyword: number,
): { marks: Map<string, number>; open: number } {
  const marks = new Map<string, number>();
  let angle = 0;
  for (const { index } of forward(source, keyword + 2)) {
    const text = textAt(source.tokens, index);
    if (text === '{') {
      return { marks, open: index };
    }
    if (angle === 0 && HEADER_WORDS.has(text) && !marks.has(text)) {
      marks.set(text, index);
    }
    angle += angleStep(text);
  }
  return { marks, open: source.tokens.length };
}

function listAfter(
  source: BareSource,
  { marks, open, word }: { marks: ReadonlyMap<string, number>; open: number; word: string },
): string[] {
  const at = marks.get(word);
  if (at === undefined) {
    return [];
  }
  const stops = [marks.get(IMPLEMENTS), marks.get(PERMITS), open]
    .filter((stop): stop is number => stop !== undefined && stop > at)
    .sort((left, right) => left - right);
  return namesIn(source, { from: at + 1, to: stops[0] ?? open });
}

function headerOf(
  source: BareSource,
  { keyword, kind }: { keyword: number; kind: TypeKind },
): Header {
  const { marks, open } = markersOf(source, keyword);
  const extended = listAfter(source, { marks, open, word: EXTENDS });
  return kind === 'interface'
    ? { superclass: undefined, interfaces: extended, open }
    : {
        superclass: extended[0],
        interfaces: listAfter(source, { marks, open, word: IMPLEMENTS }),
        open,
      };
}

function* membersIn(source: BareSource, span: Span): Generator<Member> {
  const positions = [span.from];
  for (const index of positions) {
    if (index < span.to) {
      const member = memberAt(source, index);
      yield member;
      positions.push(Math.max(member.end, index + 1));
    }
  }
}

function bodyOf(
  source: BareSource,
  { body, name }: { body: Span; name: string },
): { methods: MethodDecl[]; fields: FieldDecl[] } {
  const methods: MethodDecl[] = [];
  const fields: FieldDecl[] = [];
  for (const inner of membersIn(source, body)) {
    if (inner.kind === 'method' && inner.method.name !== name) {
      methods.push(inner.method);
    } else if (inner.kind === 'field') {
      appendAll(fields, inner.fields);
    }
  }
  return { methods, fields };
}

type TypeMember = Extract<Member, { kind: 'type' }>;

type Place = {
  readonly context: FileContext;
  readonly scope: string;
};

function typeOf(source: BareSource, member: TypeMember, place: Place): TypeDecl {
  const { tokens } = source;
  const { context, scope } = place;
  const kind = member.typeKind;
  const name = textAt(tokens, member.keyword + 1);
  const header = headerOf(source, { keyword: member.keyword, kind });
  const { methods, fields } =
    kind === 'enum' ? { methods: [], fields: [] } : bodyOf(source, { body: member.body, name });
  return {
    name,
    kind,
    pkg: context.pkg,
    scope,
    imports: context.imports,
    file: context.file,
    line: tokens[member.keyword + 1]?.line ?? 0,
    body: member.body,
    superclass: header.superclass,
    interfaces: header.interfaces,
    methods,
    fields,
  };
}

export function declarationsOf(source: BareSource, context: FileContext): TypeDecl[] {
  const found: TypeDecl[] = [];
  const pending = [{ span: { from: 0, to: source.tokens.length }, scope: context.pkg }];
  for (const { span, scope } of pending) {
    const types = [...membersIn(source, span)].filter(
      (member): member is TypeMember => member.kind === 'type',
    );
    const declared = types.map((member) => ({
      member,
      type: typeOf(source, member, { context, scope }),
    }));
    appendAll(
      found,
      declared.map(({ type }) => type),
    );
    appendAll(
      pending,
      declared
        .filter(({ type }) => type.kind !== 'enum')
        .map(({ member, type }) => ({ span: member.body, scope: `${scope}.${type.name}` })),
    );
  }
  return found;
}

const WILDCARD_IMPORT = /^\s*import\s+([\w.]+)\.\*\s*;/gmu;

function wildcardImports(text: string): string[] {
  return [...text.matchAll(WILDCARD_IMPORT)].map((match) => `${match[1] ?? ''}.*`);
}

export type ParsedTypes = { readonly source: SourceFile; readonly types: readonly TypeDecl[] };

export function mainSourceTypes(projectRoot: string, options: MainSourceOptions): ParsedTypes[] {
  return mainSourceTexts(projectRoot, options)
    .filter(({ kotlin }) => !kotlin)
    .map(({ file, text }) => {
      const clean = blankLiterals(text);
      const source = parseSource(text, { file, kotlin: false });
      return {
        source,
        types: declarationsOf(source, {
          file,
          pkg: packageOf(clean),
          imports: [...importsOf(clean), ...wildcardImports(clean)],
        }),
      };
    });
}
