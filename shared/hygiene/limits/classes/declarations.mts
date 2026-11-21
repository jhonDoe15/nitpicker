import { blankComments, closingIndex, lineAt, parseArguments } from '../scanning/scan.mts';
import { appendAll } from '../../../lists/lists.mts';
import type {
  Annotation,
  ClassRecord,
  DeclaredField,
  Fact,
  LocatedField,
  PositionedAnnotation,
} from '../fact-types.mts';

type Step = {
  readonly annotation?: Annotation;
  readonly match?: RegExpExecArray | undefined;
  readonly end: number;
};
type ClassBuilder = (file: string, text: string, match: RegExpExecArray) => ClassRecord;

const ANNOTATION = /@(?:\w+:)?([\w.]+)/uy;
const SPACE = /\s+/uy;
const AT_ANNOTATION = /@(?:\w+:)?[\w.]+/gu;
const STATEMENT_TOKEN = /[;\n(]/gu;
const MODIFIER_GAP = /^[\s\w]*$/u;
const LOOKBACK = 3000;

function readAnnotation(
  text: string,
  start: number,
): { readonly annotation: Annotation; readonly end: number } | undefined {
  ANNOTATION.lastIndex = start;
  const match = ANNOTATION.exec(text);
  if (match === null) {
    return undefined;
  }
  let end = start + match[0].length;
  let args = '';
  if (text[end] === '(') {
    const close = closingIndex(text, end);
    args = text.slice(end + 1, close);
    end = close + 1;
  }
  return {
    annotation: {
      name: (match[1] ?? '').split('.').at(-1) ?? '',
      args: parseArguments(args),
      raw: args,
    },
    end,
  };
}

function annotationsIn(text: string): PositionedAnnotation[] {
  const found: PositionedAnnotation[] = [];
  let consumed = 0;
  for (const match of text.matchAll(AT_ANNOTATION)) {
    const read = match.index >= consumed ? readAnnotation(text, match.index) : undefined;
    if (read === undefined) {
      continue;
    }
    found.push({ ...read.annotation, index: match.index, end: read.end });
    consumed = read.end;
  }
  return found;
}

export function trailingAnnotations(text: string, start: number): PositionedAnnotation[] {
  const from = Math.max(0, start - LOOKBACK);
  const found = annotationsIn(text.slice(from, start));
  const chain: PositionedAnnotation[] = [];
  let boundary = start - from;
  for (const annotation of found.reverse()) {
    if (!MODIFIER_GAP.test(text.slice(from + annotation.end, from + boundary))) {
      break;
    }
    chain.push(annotation);
    boundary = annotation.index;
  }
  return chain;
}

function skipStatement(text: string, from: number): number {
  let skipTo = from;
  for (const token of text.slice(from).matchAll(STATEMENT_TOKEN)) {
    const at = from + token.index;
    if (at < skipTo) {
      continue;
    }
    if (token[0] !== '(') {
      return at + 1;
    }
    skipTo = closingIndex(text, at) + 1;
  }
  return text.length + 1;
}

function declarationAt(
  text: string,
  index: number,
  declaration: RegExp,
): RegExpExecArray | undefined {
  declaration.lastIndex = index;
  return index < text.length ? (declaration.exec(text) ?? undefined) : undefined;
}

function stepAt(text: string, index: number, declaration: RegExp): Step {
  const read = text[index] === '@' ? readAnnotation(text, index) : undefined;
  if (read !== undefined) {
    return { annotation: read.annotation, end: read.end };
  }
  const match = declarationAt(text, index, declaration);
  const end =
    match === undefined ? skipStatement(text, index) : Math.max(declaration.lastIndex, index + 1);
  return { match, end };
}

export function scanDeclarations(text: string, declaration: RegExp, baseLine = 1): DeclaredField[] {
  const fields: DeclaredField[] = [];
  let pending: Annotation[] = [];
  let next = 0;
  for (const position of Array.from(text).keys()) {
    if (position < next) {
      continue;
    }
    SPACE.lastIndex = position;
    const index = position + (SPACE.exec(text)?.[0].length ?? 0);
    const { annotation, match, end } = stepAt(text, index, declaration);
    if (match !== undefined) {
      fields.push({
        name: match.groups?.['name'] ?? '',
        type: match.groups?.['type'] ?? '',
        annotations: pending,
        line: baseLine + lineAt(text, index) - 1,
      });
    }
    pending = annotation === undefined ? [] : [...pending, annotation];
    next = end;
  }
  return fields;
}

export function classesIn({
  file,
  source,
  pattern,
  build,
}: {
  readonly file: string;
  readonly source: string;
  readonly pattern: RegExp;
  readonly build: ClassBuilder;
}): ClassRecord[] {
  const text = blankComments(source);
  return [...text.matchAll(pattern)].map((match) => build(file, text, match));
}

function fieldsWithAncestors(
  entity: ClassRecord,
  byName: ReadonlyMap<string, ClassRecord>,
): LocatedField[] {
  const seen = new Set<string>();
  const fields: LocatedField[] = [];
  const queue = [entity];
  for (const current of queue) {
    if (seen.has(current.name)) {
      continue;
    }
    seen.add(current.name);
    appendAll(
      fields,
      current.fields.map((field) => ({ ...field, file: current.file })),
    );
    const parent = current.parent === undefined ? undefined : byName.get(current.parent);
    queue.push(...(parent === undefined ? [] : [parent]));
  }
  return fields;
}

export function declarationPattern(modifiers: RegExp, rest: string): RegExp {
  const pattern = `(?:(?:${modifiers.source})\\s+)*${rest}`;
  return new RegExp(pattern, 'uy');
}

export function classFacts(
  classes: readonly ClassRecord[],
  enums: ReadonlySet<string>,
  factsOf: (entity: ClassRecord, field: LocatedField, enums: ReadonlySet<string>) => Fact[],
): Fact[] {
  const byName = new Map(classes.map((entity): [string, ClassRecord] => [entity.name, entity]));
  return classes.flatMap((entity) =>
    fieldsWithAncestors(entity, byName).flatMap((field) => factsOf(entity, field, enums)),
  );
}
