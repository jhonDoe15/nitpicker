import { matchingOpen, remembered, trimmedEnd, wordBefore } from '../discovery/text-scan.mjs';
import { alwaysNewCalls, declarationsOf, heavyKind } from './start-kinds.mjs';

const START = /\??\.\s*start\s*\(/gu;
const GENERIC_CLOSE = '>';

function skipGenerics(scanned, open) {
  const { code } = scanned;
  const end = trimmedEnd(scanned, open);
  if (code[end - 1] !== GENERIC_CLOSE) {
    return open;
  }
  const state = { depth: 0, index: end - 1 };
  while (state.index >= 0) {
    state.depth += code[state.index] === '>' ? 1 : 0;
    state.depth -= code[state.index] === '<' ? 1 : 0;
    if (state.depth === 0) {
      return state.index;
    }
    state.index -= 1;
  }
  return open;
}

function created(scanned, close) {
  const open = matchingOpen(scanned, close);
  if (open < 0) {
    return undefined;
  }
  const { word, start } = wordBefore(scanned, skipGenerics(scanned, open));
  const kind = word === '' ? undefined : heavyKind(scanned, word);
  const qualified = scanned.code[trimmedEnd(scanned, start) - 1] === '.';
  return kind === undefined || qualified ? undefined : { offset: start, name: word };
}

function received(scanned, end) {
  const bang = scanned.code.slice(end - 2, end) === '!!' ? 2 : 0;
  const { word, start } = wordBefore(scanned, end - bang);
  const before = trimmedEnd(scanned, start);
  const viaThis =
    scanned.code[before - 1] === '.' && wordBefore(scanned, before - 1).word === 'this';
  if (word === '' || (scanned.code[before - 1] === '.' && !viaThis)) {
    return undefined;
  }
  const kinds = declarationsOf(scanned)
    .filter(({ name }) => name === word)
    .map(({ kind }) => kind);
  return kinds.length === 0
    ? undefined
    : {
        offset: start,
        name: word,
        receiver: word,
        always: kinds.every((kind) => kind === 'always'),
      };
}

function siteAt(scanned, dot) {
  const end = trimmedEnd(scanned, dot);
  return scanned.code[end - 1] === ')' ? created(scanned, end - 1) : received(scanned, end);
}

export function startSites(scanned) {
  return remembered(scanned, 'start-sites', () => {
    const starts = [...scanned.code.matchAll(START)].flatMap((match) => {
      const site = siteAt(scanned, match.index);
      return site === undefined ? [] : [site];
    });
    return [...starts, ...alwaysNewCalls(scanned)].toSorted(
      (left, right) => left.offset - right.offset,
    );
  });
}
