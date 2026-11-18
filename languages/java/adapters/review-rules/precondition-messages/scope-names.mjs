import { frameAt } from '../max-value-sums/source-file.mjs';

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
const AFTER_NAME = new Set(['=', ';', ',', ')', ':']);

function isDeclaration(tokens, index) {
  const previous = tokens[index - 1];
  const typed =
    previous !== undefined &&
    ((previous.kind === 'identifier' && !NOT_TYPES.has(previous.text)) ||
      previous.text === '>' ||
      previous.text === ']');
  return typed && tokens[index].kind === 'identifier' && AFTER_NAME.has(tokens[index + 1]?.text);
}

function declaredIn(tokens, { from, to }) {
  const names = new Set();
  for (let index = from; index < to; index += 1) {
    if (isDeclaration(tokens, index)) {
      names.add(tokens[index].text);
    }
  }
  return names;
}

export function scopeNamesOf(source) {
  const { tokens } = source;
  let outside;
  return (index) => {
    const frame = frameAt(source, index);
    if (frame !== undefined) {
      return new Set([
        ...frame.params.map(({ name }) => name),
        ...declaredIn(tokens, { from: frame.body.from, to: index }),
      ]);
    }
    outside ??= new Set(
      tokens
        .keys()
        .filter((at) => isDeclaration(tokens, at) && frameAt(source, at) === undefined)
        .map((at) => tokens[at].text),
    );
    return outside;
  };
}

function derives(tokens, index, named) {
  const binding = tokens[index - 2]?.text === 'instanceof' && tokens[index - 3]?.text === named;
  if (binding) {
    return true;
  }
  if (tokens[index + 1]?.text !== '=') {
    return false;
  }
  for (let at = index + 2; at < tokens.length && tokens[at].text !== ';'; at += 1) {
    if (tokens[at].text === named) {
      return true;
    }
  }
  return false;
}

export function isDerivedFrom(source, { checked, named }) {
  const { tokens } = source;
  return tokens.some((token, index) => token.text === checked && derives(tokens, index, named));
}
