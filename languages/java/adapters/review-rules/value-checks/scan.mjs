import { forward, startsNewLine } from '../max-value-sums/source-file.mjs';

export function statementEnd(source, from) {
  const { tokens, kotlin } = source;
  for (const { index, group } of forward(source, from)) {
    const { text } = tokens[index];
    const ends = kotlin ? index > from && startsNewLine(tokens, index) : text === ';' && !group;
    if (ends || text === '}') {
      return index;
    }
  }
  return tokens.length;
}

export function declarations(source, { from, to }) {
  const { tokens } = source;
  const found = [];
  for (const [offset, { text, kind }] of tokens.slice(from + 1, to).entries()) {
    const index = from + 1 + offset;
    const before = tokens[index - 1].text;
    if (kind === 'identifier' && tokens[index + 1]?.text === '=' && before !== '.') {
      found.push({ name: text, at: index, end: statementEnd(source, index + 2) });
    }
  }
  return found;
}

export function ownUses(source, { from, to }, name) {
  const { tokens } = source;
  const uses = [];
  for (const [offset, token] of tokens.slice(from, to).entries()) {
    const index = from + offset;
    const isName = token.text === name && tokens[index - 1]?.text !== '.';
    if (isName && tokens[index + 1]?.text !== '=') {
      uses.push(index);
    }
  }
  return uses;
}

export function textsOf(source, from, to) {
  return source.tokens.slice(from, to).map(({ text }) => text);
}

export function callBefore(source, index) {
  const open = source.opener[index];
  return open >= 0 && source.tokens[open].text === '(' ? source.tokens[open - 1]?.text : undefined;
}

export function eachFrame(source, visit) {
  return source.frames.flatMap((frame) =>
    visit({ from: frame.body.from, to: frame.body.to }, frame),
  );
}
