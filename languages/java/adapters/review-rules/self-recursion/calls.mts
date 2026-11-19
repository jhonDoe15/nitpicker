import { frameAt, splitTopLevel } from '../max-value-sums/source-file.mts';
import type { Frame, SourceFile } from '../max-value-sums/sum-types.mts';

export type Call = {
  readonly line: number;
  readonly index: number;
  readonly source: Frame;
  readonly target: Frame;
  readonly plain: boolean;
};

const NOT_CALLEES = new Set([
  'new',
  'fun',
  'this',
  'super',
  'if',
  'for',
  'while',
  'when',
  'switch',
]);
const QUALIFIER_END = 3;
const DEFERRING = new Set([
  'schedule',
  'submit',
  'execute',
  'invokeLater',
  'runLater',
  'runAsync',
  'supplyAsync',
  'scheduleAtFixedRate',
  'scheduleWithFixedDelay',
  'addListener',
  'addEventListener',
  'addShutdownHook',
  'postDelayed',
  'subscribe',
  'invokeLater',
  'setTimeout',
]);

function arityOf(source: SourceFile, open: number): number {
  const close = source.partner[open] ?? open;
  return splitTopLevel(source, { from: open + 1, to: close }).length;
}

function framesByName(source: SourceFile): Map<string, Frame[]> {
  return Map.groupBy(source.frames, ({ name }) => name);
}

function unambiguous(frames: readonly Frame[], arity: number): Frame | undefined {
  const matching = frames.filter(({ params }) => params.length === arity);
  return matching.length === 1 ? matching[0] : undefined;
}

function isDeferred(source: SourceFile, index: number): boolean {
  const opens = [source.opener[index] ?? -1];
  for (const open of opens) {
    if (open < 0) {
      return false;
    }
    if (source.tokens[open]?.text === '(' && DEFERRING.has(source.tokens[open - 1]?.text ?? '')) {
      return true;
    }
    opens.push(source.opener[open] ?? -1);
  }
  return false;
}

const TYPE_TOKENS = new Set(['<', '>', ',', '[', ']', '?', '.', '&']);
const TYPE_SPAN = 6;
const CLASS_KEYWORDS = new Set(['class', 'object', 'record', 'enum', 'interface']);
const CLASS_HEADER = 30;

function isTypeToken(source: SourceFile, index: number): boolean {
  const token = source.tokens[index];
  return token !== undefined && (token.kind === 'identifier' || TYPE_TOKENS.has(token.text));
}

function declaredAs(source: SourceFile, name: string, className: string): boolean {
  const { tokens } = source;
  return tokens.some((token, index) => {
    if (token.text !== name || tokens[index - 1]?.text === '.') {
      return false;
    }
    const before = tokens.slice(Math.max(0, index - TYPE_SPAN), index);
    const lead = before.findLastIndex((_, at) => !isTypeToken(source, index - before.length + at));
    const typed = before.slice(lead + 1).some(({ text }) => text === className);
    const after =
      tokens[index + 1]?.text === ':' ? tokens.slice(index + 2, index + 2 + TYPE_SPAN) : [];
    const kotlinTyped = after.some(({ text }) => text === className);
    return (typed && tokens[index + 1]?.text !== ':') || kotlinTyped;
  });
}

function classNames(source: SourceFile, index: number): string[] {
  const names: string[] = [];
  const opens = [source.opener[index] ?? -1];
  for (const open of opens) {
    if (open < 0) {
      return names;
    }
    const header = source.tokens.slice(Math.max(0, open - CLASS_HEADER), open);
    const keyword = header.findLastIndex(({ text }) => CLASS_KEYWORDS.has(text));
    const name = header[keyword + 1]?.text;
    if (keyword >= 0 && name !== undefined && source.tokens[open]?.text === '{') {
      names.push(name);
    }
    opens.push(source.opener[open] ?? -1);
  }
  return names;
}

function elementSources(source: SourceFile, index: number, receiver: string): string[] {
  const { tokens } = source;
  const found: string[] = [];
  const opens = [source.opener[index] ?? -1];
  for (const open of opens) {
    if (open < 0) {
      return found;
    }
    const own =
      receiver === 'it' || (tokens[open + 1]?.text === receiver && tokens[open + 2]?.text === '->');
    if (tokens[open]?.text === '{' && own && tokens[open - 2]?.text === '.') {
      found.push(tokens[open - QUALIFIER_END]?.text ?? '');
    }
    opens.push(source.opener[open] ?? -1);
  }
  const loop = tokens.findIndex(
    (token, at) => token.text === receiver && tokens[at + 1]?.text === 'in' && at < index,
  );
  return loop >= 0 ? [...found, tokens[loop + 2]?.text ?? ''] : found;
}

function sameClassReceiver(source: SourceFile, index: number): boolean {
  const receiver = source.tokens[index - 2]?.text ?? '';
  const classes = classNames(source, index);
  if (classes.includes(receiver)) {
    return true;
  }
  return classes.some(
    (className) =>
      declaredAs(source, receiver, className) ||
      elementSources(source, index, receiver).some((collection) =>
        declaredAs(source, collection, className),
      ),
  );
}

function ownCall(source: SourceFile, index: number): boolean {
  const { tokens } = source;
  const before = tokens[index - 1]?.text;
  const receiver = tokens[index - 2]?.text;
  if (before !== '.') {
    return true;
  }
  if (receiver === 'this') {
    return tokens[index - QUALIFIER_END]?.text !== '.';
  }
  return tokens[index - QUALIFIER_END]?.text !== '.' && sameClassReceiver(source, index);
}

function isPlain(source: SourceFile, index: number, caller: Frame): boolean {
  const before = source.tokens[index - 1]?.text;
  const own = before !== '.' || source.tokens[index - 2]?.text === 'this';
  return own && (source.opener[index] ?? -1) === caller.body.from - 1;
}

export function callsOf(source: SourceFile): Call[] {
  const byName = framesByName(source);
  const opens = new Set(source.frames.map(({ open }) => open));
  return source.tokens.flatMap((token, index): Call[] => {
    const open = index + 1;
    const frames = byName.get(token.text);
    const previous = source.tokens[index - 1]?.text ?? '';
    if (
      frames === undefined ||
      source.tokens[open]?.text !== '(' ||
      opens.has(open) ||
      NOT_CALLEES.has(previous) ||
      !ownCall(source, index) ||
      isDeferred(source, index)
    ) {
      return [];
    }
    const target = unambiguous(frames, arityOf(source, open));
    const caller = frameAt(source, index);
    return target === undefined || caller === undefined
      ? []
      : [
          {
            line: token.line,
            index,
            source: caller,
            target,
            plain: isPlain(source, index, caller),
          },
        ];
  });
}
