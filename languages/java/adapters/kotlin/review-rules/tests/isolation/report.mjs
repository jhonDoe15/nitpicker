import { chainName, classesOf } from '../discovery/declarations.mjs';
import { functionAround } from '../global-state/state-restores.mjs';

export function reportOf(scanned, { rule, message }, hit) {
  const fn = functionAround(scanned, hit.offset);
  const symbol = chainName(classesOf(scanned), hit.offset, fn?.name);
  return { rule, offset: hit.offset, symbol, key: `${symbol}:${hit.family}`, message };
}

export function enclosingParens(code, offset) {
  const open = [];
  for (const { index, 0: mark } of code.slice(0, offset).matchAll(/[()]/gu)) {
    if (mark === '(') {
      open.push(index);
    } else {
      open.pop();
    }
  }
  return open.toReversed();
}

export function inRanges(ranges, offset) {
  return ranges.some(({ start, end }) => start <= offset && offset < end);
}
