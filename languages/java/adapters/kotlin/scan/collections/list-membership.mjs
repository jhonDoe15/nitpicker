import { closingIndex, enclosingOpen, lineStart, splitArguments } from '../kotlin-source.mjs';
import { loopBodies } from '../loops.mjs';

const LIST_DECLARATION =
  /\b(?:val|var)\s+([A-Za-z_]\w*)\s*(?::\s*[\w.<>?, ]+)?=\s*(?:java\.util\.)?(?:mutableListOf|arrayListOf|ArrayList|LinkedList)\s*(?:<[^<>()]*(?:<[^<>()]*>[^<>()]*)*>)?\s*\(/g;
const POSITIONAL = [
  'get',
  'set',
  'indexOf',
  'lastIndexOf',
  'subList',
  'removeAt',
  'sort',
  'sortBy',
  'sortByDescending',
  'sortWith',
  'reverse',
  'shuffle',
  'removeFirst',
  'removeLast',
  'addFirst',
  'addLast',
  'listIterator',
];
const FOR_HEADER = /\bfor\s*\(\s*[\w\s,()]*$/;

function uses(code, name, from, to) {
  const scope = code.slice(0, to);
  const pattern = (body) => new RegExp(body, 'g');
  const all = (body) =>
    [...scope.matchAll(pattern(body))].filter(({ index }) => index >= from);
  const calls = (methods) =>
    all(String.raw`(?<![\w.])${name}\s*\??\.\s*(?:${methods.join('|')})\s*\(`).map((match) => ({
      offset: match.index,
      open: match.index + match[0].length - 1,
    }));
  const adds = calls(['add']);
  return {
    appends: [
      ...adds.filter(({ open }) => splitArguments(code, open).parts.length === 1),
      ...all(String.raw`(?<![\w.])${name}\s*\+=`).map((match) => ({ offset: match.index })),
    ],
    positional: [
      ...calls(POSITIONAL),
      ...adds.filter(({ open }) => splitArguments(code, open).parts.length > 1),
      ...all(String.raw`(?<![\w.])${name}\s*\[`).map((match) => ({ offset: match.index })),
    ],
    tests: [
      ...calls(['contains']),
      ...all(String.raw`(?<![\w.])!?in\s+${name}\b(?!\s*[.\[(])`)
        .filter(({ index }) => !FOR_HEADER.test(code.slice(lineStart(code, index), index)))
        .map((match) => ({ offset: match.index })),
    ],
  };
}

export function listMemberships(scanned) {
  const { code } = scanned;
  const loops = loopBodies(code);
  return [...code.matchAll(LIST_DECLARATION)].flatMap((match) => {
    const name = match[1];
    const open = enclosingOpen(code, match.index);
    const end = open === -1 ? code.length : closingIndex(code, open);
    const found = uses(code, name, match.index + match[0].length, end);
    if (found.appends.length === 0 || found.positional.length > 0) {
      return [];
    }
    const test = found.tests.find(({ offset }) =>
      loops.some((loop) => loop.open > match.index && loop.open < offset && offset < loop.close),
    );
    return test === undefined ? [] : [{ rule: 'ListUsedAsSet', offset: test.offset }];
  });
}
