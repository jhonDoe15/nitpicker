const CLASS_HEADER = /(?:^|[^\w@.])(?:class|interface|enum|record|@interface)\s+(\w+)/u;
const ANNOTATION = /@[\w.]+(?:\s*\([^()]*\))?/gu;
const CALLABLE = /(\w+)\s*\(/u;
const INITIALIZED = /(\w+)\s*=(?!=)/u;
const FIELD_NAME = /\b([A-Za-z_$][\w$]*)\s*(?:=(?!=)|;|,)/u;
const TOKEN = new RegExp(
  [
    String.raw`"""(?:\\[\s\S]|[\s\S])*?"""`,
    String.raw`\/\/[^\n]*`,
    String.raw`\/\*[\s\S]*?\*\/`,
    String.raw`"(?:\\[\s\S]|[^"\\])*"`,
    String.raw`'(?:\\[\s\S]|[^'\\])*'`,
    String.raw`[{};]`,
    String.raw`[^"'/{};]+`,
    String.raw`[\s\S]`,
  ].join('|'),
  'gu',
);
const LITERAL = /^(?:["']|\/\/|\/\*)/u;
const STRING = /^"(?!"")/u;
const JAVADOC = /^\/\*\*(?!\/)/u;

function memberName(header) {
  const plain = header.replace(ANNOTATION, ' ');
  const initialized = INITIALIZED.exec(plain);
  const callable = CALLABLE.exec(plain);
  if (initialized !== null && (callable === null || initialized.index < callable.index)) {
    return initialized[1];
  }
  return callable?.[1] ?? '<init>';
}

function frameFor(header, parent, line) {
  const named = /\bnew\s/u.test(header) ? undefined : (CLASS_HEADER.exec(header) ?? undefined);
  if (named !== undefined) {
    const name = parent?.kind === 'class' ? `${parent.name}$${named[1]}` : named[1];
    return { kind: 'class', name, start: line };
  }
  if (parent?.kind === 'class') {
    return { kind: 'member', name: `${parent.name}#${memberName(header)}@${line}`, start: line };
  }
  return { kind: 'block', start: line };
}

function newlines(text) {
  return text.split('\n').length - 1;
}

function resetHeader(state) {
  state.header = '';
  state.headerLine = undefined;
}

function openFrame(state) {
  const parent = state.stack.findLast((frame) => frame.kind !== 'block');
  state.stack.push(frameFor(state.header, parent, state.headerLine ?? state.line));
  resetHeader(state);
}

function closeFrame(state) {
  const frame = state.stack.pop();
  if (frame !== undefined && frame.kind !== 'block') {
    state.spans.push({ ...frame, end: state.line });
  }
  resetHeader(state);
}

function addText(state, text) {
  const start = text.search(/\S/u);
  if (state.headerLine === undefined && start !== -1) {
    state.headerLine = state.line + newlines(text.slice(0, start));
  }
  state.header += text;
}

const ACTIONS = new Map([
  ['{', openFrame],
  ['}', closeFrame],
  [';', resetHeader],
]);

function step(state, token) {
  if (JAVADOC.test(token)) {
    state.spans.push({ kind: 'javadoc', start: state.line, end: state.line + newlines(token) });
  }
  if (LITERAL.test(token)) {
    state.header += STRING.test(token) ? '""' : ' ';
    return;
  }
  const action = ACTIONS.get(token);
  if (action === undefined) {
    addText(state, token);
    return;
  }
  action(state);
}

export function javaSpans(text) {
  const state = { spans: [], stack: [], header: '', headerLine: undefined, line: 1 };
  for (const [token] of text.matchAll(TOKEN)) {
    step(state, token);
    state.line += newlines(token);
  }
  return state.spans;
}

function innermost(spans, kind, line) {
  return spans
    .filter((span) => span.kind === kind && span.start <= line && line <= span.end)
    .reduce(
      (inner, span) => (inner === undefined || span.start >= inner.start ? span : inner),
      undefined,
    );
}

export function lineLocator(text) {
  const spans = javaSpans(text);
  const lines = text.split('\n');
  return (line) => ({
    className: innermost(spans, 'class', line)?.name,
    member: innermost(spans, 'member', line)?.name,
    javadoc: innermost(spans, 'javadoc', line)?.start,
    field: FIELD_NAME.exec(
      withoutTypeArguments((lines[line - 1] ?? '').replace(ANNOTATION, ' ')),
    )?.[1],
  });
}

function withoutTypeArguments(text) {
  return [...text].reduce(
    ({ kept, depth }, character) => ({
      kept: depth === 0 && character !== '<' ? `${kept}${character}` : kept,
      depth: Math.max(0, depth + (character === '<' ? 1 : 0) - (character === '>' ? 1 : 0)),
    }),
    { kept: '', depth: 0 },
  ).kept;
}
