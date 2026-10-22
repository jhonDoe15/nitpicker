import { inImport } from '../kotlin-source.mjs';

const CAST_OPERATOR = /(?<![\w.$`])as(?![\w?$`])(?<target>\s*(?:[\w.]+)\??)?/g;
const NULL_WINDOW = 20;
const NULL_BEFORE = /\bnull\s*$/;
const ANY_OR_NULL = /^\s*(?:kotlin\.)?Any\?$/;

export const CAST_MESSAGES = {
  UnsafeCastOperator:
    'Narrow with an `is` check or `when` (a smart cast), or use `as?` and handle the null; `as` throws ClassCastException when the type is wrong. A test can use `assertIs<T>(value)`.',
};

export function unsafeCasts(scanned) {
  return [...scanned.code.matchAll(CAST_OPERATOR)]
    .filter(({ index, groups }) => {
      if (inImport(scanned.code, index)) {
        return false;
      }
      const before = scanned.code.slice(Math.max(0, index - NULL_WINDOW), index);
      return !NULL_BEFORE.test(before) && !ANY_OR_NULL.test(groups.target ?? '');
    })
    .map(({ index }) => ({ rule: 'UnsafeCastOperator', offset: index }));
}
