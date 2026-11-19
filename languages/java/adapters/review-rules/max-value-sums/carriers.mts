import {
  angleStep,
  between,
  forward,
  frameAt,
  splitTopLevel,
  startsNewLine,
} from './source-file.mts';
import { accessorName, valueKind } from './values/values.mts';
import type { CarrierState, Frame, KindMap, Mark, NumberKind, SourceFile } from './sum-types.mts';

const ENDS_VALUE = new Set([';', ',', ')', '}', ']']);
const KEYWORDS = new Set([
  'if',
  'for',
  'while',
  'switch',
  'catch',
  'synchronized',
  'return',
  'when',
  'fun',
  'super',
  'this',
]);
const ROUNDS = 8;
const TYPE_ENDS = new Set([',', ')', ';', '{', '}']);
const PAGE_FACTORIES = new Map([
  ['of', 1],
  ['ofSize', 0],
]);
const PAGE_TYPES = new Set(['PageRequest', 'Pageable']);

function store(): CarrierState {
  const state: CarrierState = {
    frames: new Map(),
    files: new Map(),
    fields: new Map(),
    topLevel: new Map(),
    marks: [],
    size: 0,
    remember: (map, key, kind) => {
      if (!map.has(key)) {
        map.set(key, kind);
        state.size += 1;
      }
    },
  };
  return state;
}

function nested<Key>(map: Map<Key, KindMap>, key: Key): KindMap {
  const found = map.get(key) ?? new Map<string, NumberKind>();
  map.set(key, found);
  return found;
}

function valueEnd(source: SourceFile, from: number): number {
  let last = from;
  for (const { index, end, group } of forward(source, from)) {
    const stops =
      ENDS_VALUE.has(source.tokens[index]?.text ?? '') ||
      (index > from && startsNewLine(source.tokens, index));
    if (!group && stops) {
      return index;
    }
    last = end;
  }
  return last;
}

function typeEnd(source: SourceFile, from: number): number | undefined {
  const { tokens } = source;
  let angle = 0;
  for (const { index, group } of forward(source, from)) {
    const text = tokens[index]?.text ?? '';
    if (startsNewLine(tokens, index)) {
      return undefined;
    }
    angle += angleStep(text);
    if (text === '=') {
      return index + 1;
    }
    if ((!group || text === '{') && angle <= 0 && TYPE_ENDS.has(text)) {
      return undefined;
    }
  }
  return undefined;
}

function assignmentStart(source: SourceFile, index: number): number | undefined {
  const { tokens } = source;
  if (tokens[index]?.kind !== 'identifier' || tokens[index - 1]?.text === ':') {
    return undefined;
  }
  if (tokens[index + 1]?.text === '=') {
    return index + 2;
  }
  return source.kotlin && tokens[index + 1]?.text === ':' ? typeEnd(source, index + 2) : undefined;
}

function recordNamed(
  state: CarrierState,
  source: SourceFile,
  { index, kind }: { index: number; kind: NumberKind },
): void {
  const { tokens, opener } = source;
  const open = opener[index] ?? -1;
  const declared = source.frames.find((each) => each.open === open);
  if (declared === undefined) {
    state.marks.push({ callee: tokens[open - 1]?.text, name: tokens[index]?.text ?? '', kind });
  } else {
    state.remember(nested(state.frames, declared), tokens[index]?.text ?? '', kind);
  }
}

function recordField(
  state: CarrierState,
  source: SourceFile,
  { index, kind }: { index: number; kind: NumberKind },
): void {
  const name = source.tokens[index]?.text ?? '';
  state.remember(nested(state.files, source.file), name, kind);
  state.remember(state.fields, name, kind);
  if (source.opener[index] === -1) {
    state.remember(state.topLevel, name, kind);
  }
}

function recordAssignment(state: CarrierState, source: SourceFile, index: number): void {
  const from = assignmentStart(source, index);
  if (from === undefined) {
    return;
  }
  const { tokens, opener } = source;
  const before = tokens[index - 1]?.text;
  const frame = frameAt(source, index);
  const kind = valueKind(state, { source, frame }, { from, to: valueEnd(source, from) });
  const inCall =
    (before === '(' || before === ',') &&
    source.kotlin &&
    tokens[opener[index] ?? -1]?.text === '(';
  if (kind === undefined || (before === '.' && tokens[index - 2]?.text !== 'this')) {
    return;
  }
  if (inCall) {
    recordNamed(state, source, { index, kind });
  } else if (frame !== undefined && before !== '.') {
    state.remember(nested(state.frames, frame), tokens[index]?.text ?? '', kind);
  } else {
    recordField(state, source, { index, kind });
  }
}

function recordCall(state: CarrierState, source: SourceFile, index: number): void {
  const { tokens, partner } = source;
  const callee = tokens[index];
  const closing = partner[index + 1] ?? -1;
  if (
    callee === undefined ||
    callee.kind !== 'identifier' ||
    KEYWORDS.has(callee.text) ||
    tokens[index + 1]?.text !== '(' ||
    closing < 0
  ) {
    return;
  }
  const args = splitTopLevel(source, { from: index + 2, to: closing });
  const frame = frameAt(source, index);
  const kinds = args.map((span) => valueKind(state, { source, frame }, span));
  for (const [position, kind] of kinds.entries()) {
    if (kind !== undefined) {
      state.marks.push({ callee: callee.text, position, count: args.length, kind });
    }
  }
  recordPageSize(state, { source, frame }, { index, kinds });
}

function recordPageSize(
  state: CarrierState,
  { source, frame }: { source: SourceFile; frame: Frame | undefined },
  { index, kinds }: { index: number; kinds: readonly (NumberKind | undefined)[] },
): void {
  const { tokens } = source;
  const factory = PAGE_FACTORIES.get(tokens[index]?.text ?? '');
  const owner = tokens[index - 1]?.text === '.' && PAGE_TYPES.has(tokens[index - 2]?.text ?? '');
  const kind = factory === undefined ? undefined : kinds[factory];
  if (owner && frame !== undefined && kind !== undefined) {
    state.remember(nested(state.frames, frame), '.pageSize', kind);
  }
}

function recordReturn(state: CarrierState, source: SourceFile, frame: Frame): void {
  const { tokens } = source;
  const first = tokens[frame.body.from]?.text === 'return' ? frame.body.from + 1 : frame.body.from;
  const last = tokens[frame.body.to - 1]?.text === ';' ? frame.body.to - 1 : frame.body.to;
  const single = tokens.slice(first, last).every(({ text }) => text !== ';');
  const kind = single ? valueKind(state, { source, frame }, { from: first, to: last }) : undefined;
  if (kind !== undefined && frame.params.length === 0) {
    state.remember(state.fields, frame.name, kind);
    state.remember(state.fields, accessorName(frame.name), kind);
  }
}

function applyMark(
  state: CarrierState,
  { frame, kotlin }: { frame: Frame; kotlin: boolean },
  mark: Mark,
): void {
  const named = mark.name !== undefined;
  const param = named
    ? frame.params.find(({ name }) => name === mark.name)
    : frame.params[mark.position ?? -1];
  const fits = kotlin
    ? (mark.count ?? 0) <= frame.params.length
    : mark.count === frame.params.length;
  if (param !== undefined && (named || fits)) {
    state.remember(nested(state.frames, frame), param.name, mark.kind);
  }
}

function applyMarks(state: CarrierState, sources: readonly SourceFile[]): void {
  const declared = sources.flatMap(({ kotlin, frames }) =>
    frames.map((frame) => ({ frame, kotlin })),
  );
  for (const each of declared) {
    for (const mark of state.marks.filter(({ callee }) => callee === each.frame.name)) {
      applyMark(state, each, mark);
    }
  }
}

function scan(state: CarrierState, source: SourceFile): void {
  for (const frame of source.frames) {
    recordReturn(state, source, frame);
  }
  for (const index of Array.from(source.tokens.keys())) {
    recordAssignment(state, source, index);
    recordCall(state, source, index);
  }
}

function round(state: CarrierState, sources: readonly SourceFile[]): boolean {
  const before = state.size;
  state.marks = [];
  for (const source of sources) {
    scan(state, source);
  }
  applyMarks(state, sources);
  return state.size === before;
}

export function collectCarriers(sources: readonly SourceFile[]): CarrierState {
  const state = store();
  between(0, ROUNDS).some(() => round(state, sources));
  return state;
}
