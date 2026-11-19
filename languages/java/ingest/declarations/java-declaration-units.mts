import { lineStarts } from '../../adapters/doc-comments/doc-scopes.mts';
import { frameOperations } from '../../source/frames/member-frames.mts';
import type { MemberFrame } from '../../source/frames/member-frames.mts';

const { braceHeader, dispatchToken, leaveBrace, resetMember } = frameOperations();

export type DeclarationUnit = {
  readonly file: string;
  readonly name: string;
  readonly start: number;
  readonly end: number;
};
type Frame = MemberFrame & { name: string | undefined };
type Skip = { depth: number; header: string; from: number };
type State = {
  readonly text: string;
  readonly starts: readonly number[];
  readonly file: string;
  readonly units: DeclarationUnit[];
  readonly frames: Frame[];
  skip: Skip | undefined;
};
type Range = { readonly from: number; readonly to: number };
type Handler = (state: State, frame: Frame, offset: number) => void;

const CLASS_HEADER = /\b(?:class|interface|enum|record)\s+([A-Za-z_$][\w$]*)/u;
const COMMENTS_AND_LITERALS =
  /\/\*[\s\S]*?\*\/|\/\/[^\n]*|"""[\s\S]*?"""|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/gu;
const TOKEN = /(?<![=!<>])=(?!=)|[(){};]/gu;
const INITIALIZERS = new Map([
  ['', '<init>'],
  ['static', '<clinit>'],
]);
const BRACE_DEPTH = new Map([
  ['{', 1],
  ['}', -1],
]);

function blank(text: string): string {
  return text.replaceAll(COMMENTS_AND_LITERALS, (match: string) =>
    match.replaceAll(/[^\n]/gu, ' '),
  );
}

function firstCode(text: string, from: number): number {
  const pattern = /\S/gu;
  pattern.lastIndex = from;
  return pattern.exec(text)?.index ?? from;
}

function fieldName(declaration: string): string | undefined {
  return /([A-Za-z_$][\w$]*)\s*(?:\[\s*\]\s*)*$/u.exec(declaration)?.[1];
}

function bodyFrame(name: string | undefined, memberStart: number): Frame {
  return { name, memberStart, parentheses: 0, equals: -1, braces: 0 };
}

function lineOf(starts: readonly number[], offset: number): number {
  return starts.findLastIndex((start) => start <= offset) + 1;
}

function addUnit(state: State, name: string, { from, to }: Range): void {
  const { starts, file } = state;
  state.units.push({ file, name, start: lineOf(starts, from), end: lineOf(starts, to) });
}

function onSemicolon(state: State, frame: Frame, offset: number): void {
  if (frame.parentheses !== 0 || frame.braces !== 0) {
    return;
  }
  const declaration = state.text.slice(frame.memberStart, frame.equals);
  const name = frame.equals < 0 ? undefined : fieldName(declaration);
  if (name !== undefined && frame.name !== undefined) {
    const from = firstCode(state.text, frame.memberStart);
    addUnit(state, `${frame.name}.${name}`, { from, to: offset });
  }
  resetMember(frame, offset + 1);
}

function onOpenBrace(state: State, frame: Frame, offset: number): void {
  const opened = braceHeader(state.text, frame, offset);
  if (opened === undefined) {
    return;
  }
  const header = opened.trim();
  const declared = CLASS_HEADER.exec(header)?.[1];
  if (declared === undefined) {
    const from = firstCode(state.text, frame.memberStart);
    state.skip = { depth: 1, header, from };
    return;
  }
  const name = frame.name === undefined ? declared : `${frame.name}.${declared}`;
  state.frames.push(bodyFrame(name, offset + 1));
}

function onCloseBrace(state: State, frame: Frame, offset: number): void {
  leaveBrace(state.frames, frame, offset);
}

function skipToken(state: State, token: string, offset: number): void {
  const { skip } = state;
  if (skip === undefined) {
    return;
  }
  skip.depth += BRACE_DEPTH.get(token) ?? 0;
  if (skip.depth > 0) {
    return;
  }
  state.skip = undefined;
  const frame = state.frames.at(-1);
  if (frame === undefined) {
    return;
  }
  const initializer = INITIALIZERS.get(skip.header);
  if (initializer !== undefined && frame.name !== undefined) {
    addUnit(state, `${frame.name}.${initializer}`, { from: skip.from, to: offset });
  }
  resetMember(frame, offset + 1);
}

const HANDLERS = new Map<string, Handler>([
  ['{', onOpenBrace],
  ['}', onCloseBrace],
  [';', onSemicolon],
]);

function step(state: State, token: string, offset: number): void {
  if (state.skip !== undefined) {
    skipToken(state, token, offset);
    return;
  }
  dispatchToken({ state, frame: state.frames.at(-1), handler: HANDLERS.get(token), token, offset });
}

export function javaDeclarationUnits(file: string, source: string): DeclarationUnit[] {
  const text = blank(source);
  const state: State = {
    text,
    starts: lineStarts(text),
    file,
    units: [],
    frames: [bodyFrame(undefined, 0)],
    skip: undefined,
  };
  for (const match of text.matchAll(TOKEN)) {
    step(state, match[0], match.index);
  }
  return state.units;
}
