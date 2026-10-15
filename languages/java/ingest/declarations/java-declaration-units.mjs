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

function blank(text) {
  return text.replaceAll(COMMENTS_AND_LITERALS, (match) => match.replaceAll(/[^\n]/gu, ' '));
}

function lineStarts(text) {
  const starts = [0];
  for (const [index, character] of [...text].entries()) {
    if (character === '\n') {
      starts.push(index + 1);
    }
  }
  return starts;
}

function firstCode(text, from) {
  const pattern = /\S/gu;
  pattern.lastIndex = from;
  return pattern.exec(text)?.index ?? from;
}

function fieldName(declaration) {
  return /([A-Za-z_$][\w$]*)\s*(?:\[\s*\]\s*)*$/u.exec(declaration)?.[1];
}

function bodyFrame(name, memberStart) {
  return { name, memberStart, parentheses: 0, equals: -1, braces: 0 };
}

function startMember(frame, memberStart) {
  Object.assign(frame, { memberStart, parentheses: 0, equals: -1, braces: 0 });
}

function addUnit(state, name, { from, to }) {
  const { starts } = state;
  const lineOf = (offset) => starts.findLastIndex((start) => start <= offset) + 1;
  state.units.push({ file: state.file, name, start: lineOf(from), end: lineOf(to) });
}

function onSemicolon(state, frame, offset) {
  if (frame.parentheses !== 0 || frame.braces !== 0) {
    return;
  }
  const declaration = state.text.slice(frame.memberStart, frame.equals);
  const name = frame.equals < 0 ? undefined : fieldName(declaration);
  if (name !== undefined && frame.name !== undefined) {
    const from = firstCode(state.text, frame.memberStart);
    addUnit(state, `${frame.name}.${name}`, { from, to: offset });
  }
  startMember(frame, offset + 1);
}

function onOpenBrace(state, frame, offset) {
  if (frame.parentheses !== 0 || frame.equals >= 0 || frame.braces !== 0) {
    frame.braces += 1;
    return;
  }
  const header = state.text.slice(frame.memberStart, offset).trim();
  const declared = CLASS_HEADER.exec(header)?.[1];
  if (declared === undefined) {
    const from = firstCode(state.text, frame.memberStart);
    state.skip = { depth: 1, header, from };
    return;
  }
  const name = frame.name === undefined ? declared : `${frame.name}.${declared}`;
  state.frames.push(bodyFrame(name, offset + 1));
}

function onCloseBrace(state, frame, offset) {
  if (frame.braces > 0) {
    frame.braces -= 1;
    return;
  }
  state.frames.pop();
  const parent = state.frames.at(-1);
  if (parent !== undefined) {
    startMember(parent, offset + 1);
  }
}

function skipToken(state, token, offset) {
  const { skip } = state;
  skip.depth += BRACE_DEPTH.get(token) ?? 0;
  if (skip.depth > 0) {
    return;
  }
  state.skip = undefined;
  const frame = state.frames.at(-1);
  const initializer = INITIALIZERS.get(skip.header);
  if (initializer !== undefined && frame.name !== undefined) {
    addUnit(state, `${frame.name}.${initializer}`, { from: skip.from, to: offset });
  }
  startMember(frame, offset + 1);
}

const HANDLERS = new Map([
  [
    '(',
    (state, frame) => {
      frame.parentheses += 1;
    },
  ],
  [
    ')',
    (state, frame) => {
      frame.parentheses -= 1;
    },
  ],
  [
    '=',
    (state, frame, offset) => {
      if (frame.parentheses === 0 && frame.equals < 0) {
        frame.equals = offset;
      }
    },
  ],
  ['{', onOpenBrace],
  ['}', onCloseBrace],
  [';', onSemicolon],
]);

function step(state, token, offset) {
  if (state.skip !== undefined) {
    skipToken(state, token, offset);
    return;
  }
  const frame = state.frames.at(-1);
  if (frame !== undefined) {
    HANDLERS.get(token)?.(state, frame, offset);
  }
}

export function javaDeclarationUnits(file, source) {
  const text = blank(source);
  const state = {
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
