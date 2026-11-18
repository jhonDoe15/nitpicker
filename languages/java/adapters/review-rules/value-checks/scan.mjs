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
  for (let index = from + 1; index < to; index += 1) {
    const { text, kind } = tokens[index];
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
  for (let index = from; index < to; index += 1) {
    const isName = tokens[index].text === name && tokens[index - 1]?.text !== '.';
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
