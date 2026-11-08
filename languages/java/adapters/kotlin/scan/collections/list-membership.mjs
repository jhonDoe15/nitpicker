import { escapeRegExp } from '../../../../../../shared/paths/glob.mjs';
import { closingIndex, enclosingOpen, lineStart, splitArguments } from '../kotlin-source.mjs';
import { loopBodies } from '../loops.mjs';

const LIST_DECLARATION =
  /\b(?:val|var)\s+(\w+)\b[^=\n]*=\s*(?:java\.util\.)?(?:mutableListOf|arrayListOf|ArrayList|LinkedList)\b/g;
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
const FOR_HEADER = /\bfor\s*\([\w\s,()]*$/;

function matchesIn(scope, body) {
  return [...scope.code.slice(0, scope.to).matchAll(new RegExp(body, 'g'))].filter(
    ({ index }) => index >= scope.from,
  );
}

function callsOn(scope, methods) {
  const receiver = String.raw`(?<![\w.])${escapeRegExp(scope.name)}\s*\??\.\s*`;
  return matchesIn(scope, String.raw`${receiver}(?:${methods.join('|')})\s*\(`).map((match) => ({
    offset: match.index,
    open: match.index + match[0].length - 1,
  }));
}

function offsetsOf(scope, body) {
  return matchesIn(scope, body).map((match) => ({ offset: match.index }));
}

function usesIn(scope) {
  const { code } = scope;
  const name = escapeRegExp(scope.name);
  const adds = callsOn(scope, ['add']);
  const arity = ({ open }) => splitArguments(code, open).parts.length;
  const inTests = matchesIn(scope, String.raw`(?<![\w.])!?in\s+${name}\b(?!\s*[.[(])`).filter(
    ({ index }) => !FOR_HEADER.test(code.slice(lineStart(code, index), index)),
  );
  return {
    appends: [
      ...adds.filter((add) => arity(add) === 1),
      ...offsetsOf(scope, String.raw`(?<![\w.])${name}\s*\+=`),
    ],
    positional: [
      ...callsOn(scope, POSITIONAL),
      ...adds.filter((add) => arity(add) > 1),
      ...offsetsOf(scope, String.raw`(?<![\w.])${name}\s*\[`),
    ],
    tests: [...callsOn(scope, ['contains']), ...inTests.map((match) => ({ offset: match.index }))],
  };
}

export function listMemberships(scanned) {
  const { code } = scanned;
  const loops = loopBodies(code);
  return [...code.matchAll(LIST_DECLARATION)].flatMap((match) => {
    const open = enclosingOpen(code, match.index);
    const to = open === -1 ? code.length : closingIndex(code, open);
    const found = usesIn({ code, name: match[1], from: match.index + match[0].length, to });
    if (found.appends.length === 0 || found.positional.length > 0) {
      return [];
    }
    const test = found.tests.find(({ offset }) =>
      loops.some((loop) => loop.open > match.index && loop.open < offset && offset < loop.close),
    );
    return test === undefined ? [] : [{ rule: 'ListUsedAsSet', offset: test.offset }];
  });
}
