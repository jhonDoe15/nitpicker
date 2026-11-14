import { afterCall } from '../kotlin-brackets.mjs';

const MAP_CALL = /\.\s*map(?=\s*[({])/g;
const FLATTEN = /^\s*\??\.\s*flatten\s*\(\s*\)/;
const COPY_CALL = /\.\s*(?:toList|toMutableList)\s*\(\s*\)/g;
const COPY_READ =
  /^\s*\??\.\s*(?:size\b(?!\s*\()|count\s*\(\s*\)|isEmpty\s*\(\s*\)|isNotEmpty\s*\(\s*\))/;

export function wastedSteps(scanned) {
  const { code } = scanned;
  const flattened = [...code.matchAll(MAP_CALL)].filter((match) =>
    FLATTEN.test(code.slice(afterCall(code, match.index + match[0].length))),
  );
  const copied = [...code.matchAll(COPY_CALL)].filter((match) =>
    COPY_READ.test(code.slice(match.index + match[0].length)),
  );
  return [...flattened, ...copied]
    .map((match) => ({ rule: 'RedundantStreamStep', offset: match.index }))
    .toSorted((left, right) => left.offset - right.offset);
}
