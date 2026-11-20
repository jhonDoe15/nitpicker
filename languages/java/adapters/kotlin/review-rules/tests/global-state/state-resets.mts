import type { TestScanned } from '../typed/discovery-types.mts';
import type { Access } from '../typed/rule-types.mts';
import { functionsOf } from '../discovery/functions.mts';
import { closeOf, marksFrom } from '../discovery/text-scan.mts';

const BEFORE_EACH_ANNOTATIONS = new Set(['BeforeEach', 'Before', 'BeforeMethod']);
const KOTEST_BEFORE_EACH = /(?<![\w.])(?:beforeTest|beforeEach|beforeAny)\s*(?:\([^()]*\)\s*)?\{/gu;
const WRITTEN_LITERAL = /\s*=(?!=)\s*(?:null|true|false|-?\d[\w.]*)\s*(?:;|\r?\n|\}|$)/uy;
const EMPTY_CALL = /\(\s*\)/uy;
const SETTER = /^set[A-Z]/u;
const MAIN = 'main';
type Zone = { readonly start: number; readonly end: number };

function at(pattern: RegExp, code: string, from: number): boolean {
  const sticky = new RegExp(pattern.source, pattern.flags);
  sticky.lastIndex = from;
  return sticky.test(code);
}

function memberEnd(code: string, { offset, member }: Access): number {
  const found = code.indexOf(member, offset);
  return found < 0 ? -1 : found + member.length;
}

function beforeEachZones(scanned: TestScanned): Zone[] {
  const hooks = functionsOf(scanned)
    .filter((fn) => fn.annotations.some(({ name }) => BEFORE_EACH_ANNOTATIONS.has(name)))
    .map(({ body }) => ({ start: body.start, end: body.end }));
  const blocks = [...marksFrom(scanned.code, KOTEST_BEFORE_EACH, 0)].map(({ index, 0: text }) => {
    const open = index + text.length - 1;
    return { start: open + 1, end: closeOf(scanned, open) };
  });
  return [...hooks, ...blocks];
}

function insideMain(scanned: TestScanned, offset: number): boolean {
  return functionsOf(scanned).some(
    ({ name, body }) => name === MAIN && body.start <= offset && offset < body.end,
  );
}

export function resetsBeforeEachTest(scanned: TestScanned): (access: Access) => boolean {
  const zones = beforeEachZones(scanned);
  const { code } = scanned;
  return (access) => {
    const end = memberEnd(code, access);
    if (end < 0) {
      return false;
    }
    if (access.kind === 'call') {
      return (
        insideMain(scanned, access.offset) ||
        (SETTER.test(access.member) && at(EMPTY_CALL, code, end))
      );
    }
    const before = zones.some(({ start, end: to }) => start <= access.offset && access.offset < to);
    return insideMain(scanned, access.offset) || (before && at(WRITTEN_LITERAL, code, end));
  };
}
