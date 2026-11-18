import { braceDepths, closingIndex } from '../../kotlin-source.mts';

export type Body = { open: number; end: number };
export type Member = Body & { name: string; offset: number };
export type Statement = { offset: number; text: string; open: number };
export type Property = {
  kind: string;
  name: string;
  offset: number;
  depth: number | undefined;
  text: string;
};

const CLASS_HEADER = /(?<![\w$.])(?:class|object)\s+([A-Za-z_]\w*)/g;
const FUNCTION_HEADER = /(?<![\w$.])fun\s+(?:<[^>]*>\s*)?(?:[\w.<>?]+\.)?([A-Za-z_]\w*)\s*\(/g;
const PROPERTY_HEADER =
  /(?<![\w$.])(va[lr])\s+(?:<[^>]*>\s*)?([A-Za-z_]\w*)(?=\s*[:=]|\s+by\b|\s*\n)/g;
const DECLARATION_START =
  /^(?:fun|val|var|class|object|interface|import|package|private|internal|public|@|\})/;
const HEADER_TOKEN = /[({=\n]/g;
const CLOSE_NAME =
  /^(?:close|dispose|destroy|shutdown|stop|teardown|tearDown|disconnect|end|onDestroy|cleanup)$/;

export function isCloseName(name: string): boolean {
  return CLOSE_NAME.test(name);
}

function bodyOpen(code: string, from: number): number {
  let skipTo = from;
  for (const match of code.slice(from).matchAll(HEADER_TOKEN)) {
    const at = from + match.index;
    const [character] = match;
    if (at < skipTo) {
      continue;
    }
    if (character === '(') {
      skipTo = closingIndex(code, at) + 1;
      continue;
    }
    if (character === '{') {
      return at;
    }
    if (character === '=' || endsHeader(code, at)) {
      return -1;
    }
  }
  return -1;
}

function endsHeader(code: string, at: number): boolean {
  return code[at] === '\n' && DECLARATION_START.test(code.slice(at + 1).trimStart());
}

export function classBodies(code: string): Member[] {
  return [...code.matchAll(CLASS_HEADER)]
    .map((match) => {
      const open = bodyOpen(code, match.index + match[0].length);
      return open === -1
        ? undefined
        : { name: match[1] ?? '', open, end: closingIndex(code, open), offset: match.index };
    })
    .filter((body) => body !== undefined);
}

function expressionEnd(code: string, from: number): number {
  let consumed = 0;
  let text = '';
  for (const line of code.slice(from).split('\n')) {
    text += line;
    consumed += line.length;
    if (balance(text) <= 0) {
      break;
    }
    text += '\n';
    consumed += 1;
  }
  return from + consumed;
}

function expressionOpen(code: string, from: number): number {
  const header = /^[^\n={]*=(?!=)/.exec(code.slice(from));
  return header === null ? -1 : from + header[0].length - 1;
}

type FunctionMatch = { index: number; text: string; name: string };

function functionBody(
  code: string,
  match: FunctionMatch,
  level: { depths: Int32Array; depth: number | undefined },
): Member | undefined {
  const parameters = code.indexOf('(', match.index + match.text.length - 1);
  const afterParameters = closingIndex(code, parameters) + 1;
  const open = bodyOpen(code, afterParameters);
  if (level.depths[match.index] !== level.depth) {
    return undefined;
  }
  if (open !== -1) {
    return { name: match.name, open, end: closingIndex(code, open), offset: match.index };
  }
  const equals = expressionOpen(code, afterParameters);
  return equals === -1
    ? undefined
    : { name: match.name, open: equals, end: expressionEnd(code, equals), offset: match.index };
}

export function memberFunctions(code: string, body: Body, depths = braceDepths(code)): Member[] {
  const text = code.slice(body.open + 1, body.end);
  const level = { depths, depth: depths[body.open + 1] };
  return [...text.matchAll(FUNCTION_HEADER)]
    .map((match) =>
      functionBody(
        code,
        { index: match.index + body.open + 1, text: match[0], name: match[1] ?? '' },
        level,
      ),
    )
    .filter((fn) => fn !== undefined);
}

function bracketDelta(character: string): number {
  if ('({['.includes(character)) {
    return 1;
  }
  return ')}]'.includes(character) ? -1 : 0;
}

function balance(text: string): number {
  return Array.from(text).reduce((sum, character) => sum + bracketDelta(character), 0);
}

export function statementsOf(code: string, block: Body): Statement[] {
  const statements: Statement[] = [];
  const lines = [...code.slice(block.open + 1, block.end).matchAll(/[^\n]*(?:\n|$)/g)];
  for (const { index, 0: line } of lines) {
    const text = line.trim();
    const last = statements.at(-1);
    if (text === '') {
      continue;
    }
    if (last !== undefined && (last.open > 0 || /^(?:\?\.|\.|\?:)/.test(text))) {
      last.text += ` ${text}`;
      last.open = balance(last.text);
    } else {
      statements.push({
        offset: block.open + 1 + index + line.indexOf(text),
        text,
        open: balance(text),
      });
    }
  }
  return statements;
}

export function memberProperties(code: string, body: Body, depths = braceDepths(code)): Property[] {
  const text = code.slice(body.open + 1, body.end);
  const depth = depths[body.open + 1];
  return [...text.matchAll(PROPERTY_HEADER)]
    .map((match) => {
      const offset = match.index + body.open + 1;
      const line = code.indexOf('\n', offset);
      return {
        kind: match[1] ?? '',
        name: match[2] ?? '',
        offset,
        depth: depths[offset],
        text: code.slice(offset, line === -1 ? code.length : line),
      };
    })
    .filter((property) => property.depth === depth);
}
