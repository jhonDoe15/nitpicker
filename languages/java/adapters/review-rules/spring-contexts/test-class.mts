import { tokenizeJvm } from '../../reuse/source/tokens/jvm-tokens.mts';
import type { Token } from '../../reuse/jvm-reuse-types.mts';

export type TestClass = {
  readonly name: string;
  readonly parent: string | undefined;
  readonly packageName: string;
  readonly line: number;
  readonly abstract: boolean;
  readonly tests: boolean;
  readonly annotations: readonly string[];
  readonly mocks: readonly string[];
  readonly ownContext: boolean;
};

type Layout = { readonly close: ReadonlyMap<number, number>; readonly depth: readonly number[] };
type Annotation = { readonly name: string; readonly text: string; readonly end: number };

const OPENERS = new Set(['(', '{', '[']);
const CLOSERS = new Set([')', '}', ']']);
const MOCKS = new Set(['MockBean', 'MockitoBean', 'SpyBean', 'MockitoSpyBean']);
const TESTS = new Set(['Test', 'ParameterizedTest', 'RepeatedTest', 'TestFactory', 'TestTemplate']);
const OWN_CONTEXT = new Set([
  'DynamicPropertySource',
  'ServiceConnection',
  'Container',
  'TestConfiguration',
  'Configuration',
  'SpringBootConfiguration',
  'SpringBootApplication',
  'TestBean',
  'Nested',
]);
const MODIFIERS = new Set(['private', 'protected', 'public', 'static', 'final', 'transient']);
const TYPE_KEYWORDS = new Set(['class', 'interface', 'enum', 'record']);
const DECLARATION_ENDS = new Set([';', '=', '{', '(']);

function layoutOf(tokens: readonly Token[]): Layout {
  const stack: number[] = [];
  const close = new Map<number, number>();
  const depth: number[] = [];
  for (const [at, token] of tokens.entries()) {
    const open = CLOSERS.has(token.text) ? stack.pop() : undefined;
    if (open !== undefined) {
      close.set(open, at);
    }
    depth.push(stack.length);
    if (OPENERS.has(token.text)) {
      stack.push(at);
    }
  }
  return { close, depth };
}

function dottedEnd(tokens: readonly Token[], from: number): number {
  let end = from + 1;
  while (tokens[end]?.text === '.' && tokens[end + 1]?.kind === 'identifier') {
    end += 2;
  }
  return end;
}

function annotationAt(tokens: readonly Token[], layout: Layout, at: number): Annotation {
  const nameEnd = dottedEnd(tokens, at + 1);
  const name = tokens[nameEnd - 1]?.text ?? '';
  const close = tokens[nameEnd]?.text === '(' ? layout.close.get(nameEnd) : undefined;
  const end = close === undefined ? nameEnd : close + 1;
  const written = tokens
    .slice(nameEnd, end)
    .map((token) => token.text)
    .join('');
  return { name, text: `@${name}${written === '()' ? '' : written}`, end };
}

function annotationsIn(
  tokens: readonly Token[],
  layout: Layout,
  { from, to, depth }: { from: number; to: number; depth: number },
): (Annotation & { readonly at: number })[] {
  return tokens.flatMap((token, at) =>
    at >= from &&
    at < to &&
    token.text === '@' &&
    layout.depth[at] === depth &&
    tokens[at + 1]?.text !== 'interface'
      ? [{ ...annotationAt(tokens, layout, at), at }]
      : [],
  );
}

function afterAnnotations(tokens: readonly Token[], layout: Layout, from: number): number {
  let at = from;
  while (tokens[at]?.text === '@') {
    at = annotationAt(tokens, layout, at).end;
  }
  return at;
}

function mockedType(tokens: readonly Token[], layout: Layout, annotation: Annotation): string {
  const from = afterAnnotations(tokens, layout, annotation.end);
  const end = tokens.findIndex((token, at) => at >= from && DECLARATION_ENDS.has(token.text));
  return tokens
    .slice(from, end === -1 ? from : end)
    .filter((token) => !MODIFIERS.has(token.text))
    .slice(0, -1)
    .map((token) => token.text)
    .join('');
}

function parentOf(tokens: readonly Token[], from: number, bodyStart: number): string | undefined {
  const at = tokens.findIndex((token, index) => index > from && token.text === 'extends');
  if (at === -1 || at > bodyStart) {
    return undefined;
  }
  return tokens[dottedEnd(tokens, at + 1) - 1]?.text;
}

function headerStart(tokens: readonly Token[], layout: Layout, declaration: number): number {
  return (
    tokens.findLastIndex(
      (token, at) => at < declaration && layout.depth[at] === 0 && token.text === ';',
    ) + 1
  );
}

function packageOf(tokens: readonly Token[]): string {
  if (tokens[0]?.text !== 'package') {
    return '';
  }
  return tokens
    .slice(1, dottedEnd(tokens, 1))
    .map((token) => token.text)
    .join('');
}

export function testClassOf(text: string): TestClass | undefined {
  const tokens = tokenizeJvm(text);
  const layout = layoutOf(tokens);
  const declaration = tokens.findIndex(
    (token, at) =>
      layout.depth[at] === 0 && TYPE_KEYWORDS.has(token.text) && tokens[at - 1]?.text !== '@',
  );
  const nameToken = tokens[declaration + 1];
  const bodyStart = tokens.findIndex((token, at) => at > declaration && token.text === '{');
  if (tokens[declaration]?.text !== 'class' || nameToken === undefined || bodyStart === -1) {
    return undefined;
  }
  const from = headerStart(tokens, layout, declaration);
  const header = annotationsIn(tokens, layout, { from, to: declaration, depth: 0 });
  const bodyEnd = layout.close.get(bodyStart) ?? tokens.length;
  const members = annotationsIn(tokens, layout, { from: bodyStart, to: bodyEnd, depth: 1 });
  return {
    name: nameToken.text,
    parent: parentOf(tokens, declaration, bodyStart),
    packageName: packageOf(tokens),
    line: nameToken.line,
    abstract: tokens.slice(from, declaration).some((token) => token.text === 'abstract'),
    tests: members.some(({ name }) => TESTS.has(name)),
    annotations: header.map((annotation) => annotation.text),
    mocks: members
      .filter(({ name }) => MOCKS.has(name))
      .map((annotation) => `${annotation.text} ${mockedType(tokens, layout, annotation)}`),
    ownContext: members.some(({ name }) => OWN_CONTEXT.has(name)),
  };
}
