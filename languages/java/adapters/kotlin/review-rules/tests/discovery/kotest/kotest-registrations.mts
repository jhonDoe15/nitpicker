import { groupOf, slotOf } from '../../typed/indexing.mts';
import type {
  Found,
  Imports,
  KotestView,
  Registration,
  Span,
  TestScanned,
} from '../../typed/discovery-types.mts';

type Kind = 'loop' | 'clear' | 'opaque';
const CLEAR = 'clear';
type LevelState = {
  start: number;
  cursor: number;
  counts: Record<Kind, number>;
  kinds: Kind[];
};
type Levels = { accepts: (offset: number) => boolean; dynamic: (offset: number) => boolean };
import { braceDepths, parenDepths } from '../../../../scan/kotlin-source.mts';
import { hostAt } from '../hosts.mts';
import { importsOf } from '../imports.mts';
import { closeOf, execAt, marksFrom, remembered, repeatUntil } from '../text-scan.mts';

const REGISTRATIONS = new Set(
  'test context describe it should given when then and feature scenario expect example'.split(' '),
);
const CALL = /(?<![\w.`])(`?)([A-Za-z]+)\1\s*\(\s*(?=")/gu;
const DATA_CALL = /(?<![\w.`])withData\s*\(/gu;
const AFTER_LITERAL = /\s*(?:-\s*|(?:[Ss]hould|[Ww]hen|[Gg]iven|[Tt]hen|[Aa]nd)\s+)?(?=\{)/u;
const CONFIG = /\s*\.\s*config\s*(?=\()/u;
const TRANSPARENT = new Set('run with apply also let if else try finally'.split(' '));
const LOOPS = new Set(
  'repeat forEach forEachIndexed forEachEntry onEach map mapIndexed flatMap for while'.split(' '),
);
const MAX_CONFIG_CHAIN = 8;

export function viewOf(scanned: TestScanned): KotestView {
  return remembered(scanned, 'kotest-view', () => ({
    scanned,
    braces: braceDepths(scanned.code),
    parens: parenDepths(scanned.code),
    imports: importsOf(scanned),
    literalTexts: new Map(scanned.literals.map((literal) => [literal.start, literal.text])),
  }));
}

function parseCallee(
  name: string,
  imports: Imports,
): { callee: string; prefix: string } | undefined {
  const resolved = imports.aliases.get(name)?.target ?? name;
  const lower = resolved.toLowerCase();
  if (REGISTRATIONS.has(lower)) {
    return { callee: lower, prefix: '' };
  }
  const prefix = resolved[0];
  const rest = resolved.slice(1).toLowerCase();
  return (prefix === 'x' || prefix === 'f') && REGISTRATIONS.has(rest)
    ? { callee: rest, prefix }
    : undefined;
}

function afterConfig(scanned: TestScanned, from: number): { configs: string[]; at: number } {
  const { code, source } = scanned;
  const configs: string[] = [];
  const state = { at: from };
  repeatUntil(MAX_CONFIG_CHAIN, () => {
    const found = execAt(code, CONFIG, state.at);
    if (found === undefined) {
      return true;
    }
    const open = state.at + found[0].length;
    const close = closeOf(scanned, open);
    configs.push(source.slice(open + 1, close));
    state.at = close + 1;
    return false;
  });
  return { configs, at: state.at };
}

function bodyAfter(scanned: TestScanned, from: number, allowDash: boolean): Span | undefined {
  const { code } = scanned;
  const head = execAt(code, allowDash ? AFTER_LITERAL : /\s*(?=\{)/u, from);
  if (head === undefined) {
    return undefined;
  }
  const open = from + head[0].length;
  return { start: open + 1, end: closeOf(scanned, open) };
}

function callRegistrations({ scanned, imports }: KotestView, { start, end }: Span): Found[] {
  const { code } = scanned;
  return [...code.slice(start, end).matchAll(CALL)].flatMap((match) => {
    const index = start + match.index;
    const parsed = parseCallee(groupOf(match, 2), imports);
    if (parsed === undefined) {
      return [];
    }
    const open = index + match[0].indexOf('(');
    const { configs, at } = afterConfig(scanned, closeOf(scanned, open) + 1);
    const body = bodyAfter(scanned, at, false);
    const literal = index + match[0].length;
    return body === undefined ? [] : [{ ...parsed, offset: index, literal, configs, body }];
  });
}

function dataRegistrations({ scanned }: KotestView, { start, end }: Span): Found[] {
  const { code } = scanned;
  return [...code.slice(start, end).matchAll(DATA_CALL)].flatMap((match) => {
    const index = start + match.index;
    const body = bodyAfter(scanned, closeOf(scanned, index + match[0].length - 1) + 1, false);
    return body === undefined
      ? []
      : [{ callee: 'withData', prefix: '', offset: index, literal: -1, configs: [], body }];
  });
}

function stringRegistrations({ scanned }: KotestView, { start, end }: Span): Found[] {
  return scanned.literals
    .filter((literal) => literal.start >= start && literal.end <= end)
    .flatMap((literal) => {
      const { configs, at } = afterConfig(scanned, literal.end);
      const body = bodyAfter(scanned, at, true);
      const offset = literal.start;
      return body === undefined
        ? []
        : [{ callee: 'string', prefix: '', offset, literal: offset, configs, body }];
    });
}

function kindOf(name: string): Kind {
  if (LOOPS.has(name)) {
    return 'loop';
  }
  return TRANSPARENT.has(name) ? CLEAR : 'opaque';
}

function levelOf({ counts }: LevelState): number {
  if (counts.opaque > 0) {
    return 0;
  }
  return counts.loop > 0 ? 2 : 1;
}

function paint(map: Uint8Array, state: LevelState, to: number): void {
  map.fill(levelOf(state), state.cursor - state.start, to - state.start);
  state.cursor = to;
}

function levelMap(view: KotestView, { start, end }: Span): Uint8Array {
  const { scanned } = view;
  const map = new Uint8Array(Math.max(0, end - start) + 1);
  const state: LevelState = {
    start,
    cursor: start,
    counts: { opaque: 0, clear: 0, loop: 0 },
    kinds: [CLEAR],
  };
  for (const { index, 0: mark } of marksFrom(scanned.code, /[{}]/gu, start)) {
    if (index >= end) {
      break;
    }
    paint(map, state, index);
    const opens = mark === '{';
    const kind = opens ? kindOf(hostAt(scanned, index).name) : (state.kinds.pop() ?? CLEAR);
    state.counts[kind] += opens ? 1 : -1;
    if (opens) {
      state.kinds.push(kind);
    }
  }
  paint(map, state, end);
  return map;
}

export function levelsOf(view: KotestView, range: Span): Levels {
  const levels = levelMap(view, range);
  const baseParens = view.parens[range.start];
  return {
    accepts: (offset) =>
      slotOf(levels, offset - range.start) > 0 && view.parens[offset] === baseParens,
    dynamic: (offset) => slotOf(levels, offset - range.start) === 2,
  };
}

export function registrationsIn(view: KotestView, range: Span): Registration[] {
  const { accepts, dynamic } = levelsOf(view, range);
  return [
    ...callRegistrations(view, range),
    ...dataRegistrations(view, range),
    ...stringRegistrations(view, range),
  ]
    .filter(({ offset }) => accepts(offset))
    .map((found) => ({ ...found, dynamic: dynamic(found.offset) }))
    .toSorted((left, right) => left.offset - right.offset);
}

export function hasNestedRegistration(scanned: TestScanned, { start, end }: Span): boolean {
  const view = viewOf(scanned);
  const found = [
    ...callRegistrations(view, { start, end }),
    ...dataRegistrations(view, { start, end }),
    ...stringRegistrations(view, { start, end }),
  ];
  return found.length > 0;
}
