import { frameAt } from '../max-value-sums/source-file.mts';
import type { BareSource, SourceFile, Span } from '../max-value-sums/sum-types.mts';
import type { Token } from '../../reuse/jvm-reuse-types.mts';

const NOT_TYPES = new Set([
  'return',
  'else',
  'new',
  'throw',
  'case',
  'in',
  'is',
  'as',
  'if',
  'while',
]);
const BINDING_RECEIVER_OFFSET = 3;
const AFTER_NAME = new Set(['=', ';', ',', ')', ':']);

function isDeclaration(tokens: readonly Token[], index: number): boolean {
  const previous = tokens[index - 1];
  const typed =
    previous !== undefined &&
    ((previous.kind === 'identifier' && !NOT_TYPES.has(previous.text)) ||
      previous.text === '>' ||
      previous.text === ']');
  return (
    typed && tokens[index]?.kind === 'identifier' && AFTER_NAME.has(tokens[index + 1]?.text ?? '')
  );
}

function declaredIn(tokens: readonly Token[], { from, to }: Span): Set<string> {
  const names = new Set<string>();
  for (const [offset, token] of tokens.slice(from, to).entries()) {
    if (isDeclaration(tokens, from + offset)) {
      names.add(token.text);
    }
  }
  return names;
}

export function scopeNamesOf(source: SourceFile): (index: number) => ReadonlySet<string> {
  const { tokens } = source;
  let outside: Set<string> | undefined;
  return (index) => {
    const frame = frameAt(source, index);
    if (frame !== undefined) {
      return new Set([
        ...frame.params.map(({ name }) => name),
        ...declaredIn(tokens, { from: frame.body.from, to: index }),
      ]);
    }
    outside ??= new Set(
      tokens.flatMap(({ text }, at) =>
        isDeclaration(tokens, at) && frameAt(source, at) === undefined ? [text] : [],
      ),
    );
    return outside;
  };
}

function derives(tokens: readonly Token[], index: number, named: string): boolean {
  const binding =
    tokens[index - 2]?.text === 'instanceof' &&
    tokens[index - BINDING_RECEIVER_OFFSET]?.text === named;
  if (binding) {
    return true;
  }
  if (tokens[index + 1]?.text !== '=') {
    return false;
  }
  const rest = tokens.slice(index + 2);
  const end = rest.findIndex((token) => token.text === ';');
  return (end === -1 ? rest : rest.slice(0, end)).some((token) => token.text === named);
}

export function isDerivedFrom(
  source: BareSource,
  { checked, named }: { checked: string; named: string },
): boolean {
  const { tokens } = source;
  return tokens.some((token, index) => token.text === checked && derives(tokens, index, named));
}
