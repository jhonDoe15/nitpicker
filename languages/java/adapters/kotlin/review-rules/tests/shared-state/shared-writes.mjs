import { chainName, classesOf } from '../discovery/declarations.mjs';
import { functionsOf } from '../discovery/functions.mjs';
import { closeOf, escaped, previousSignificant } from '../discovery/text-scan.mjs';

const PER_TEST_ANNOTATIONS = new Set([
  'BeforeEach',
  'AfterEach',
  'Before',
  'After',
  'BeforeMethod',
  'AfterMethod',
  'BeforeTest',
  'AfterTest',
]);
const PER_TEST_NAMES = new Set([
  'beforeTest',
  'afterTest',
  'beforeEach',
  'afterEach',
  'beforeAny',
  'afterAny',
]);
const PER_TEST_LAMBDA =
  /(?<![\w.`])(?:beforeTest|afterTest|beforeEach|afterEach|beforeAny|afterAny)\s*\{/gu;
const MUTATORS = [
  'add|addAll|addFirst|addLast|put|putAll|putIfAbsent|getOrPut|remove\\w*|retainAll|clear|set|push|pop',
  'offer\\w*|poll\\w*|compute\\w*|merge|replace\\w*|sort|sortBy|sortWith|sortDescending|sortByDescending',
  'shuffle|reverse|fill|append\\w*|insert|delete\\w*|setLength|increment\\w*|decrement\\w*|getAnd\\w*',
  'addAndGet|accumulateAndGet|updateAndGet|lazySet|compareAndSet|drainTo',
].join('|');
const RESETTERS = new Set(['clear', 'set', 'reset', 'setLength']);
const QUALIFIER = String.raw`((?:this|Companion|[A-Z]\w*(?:\s*\.\s*Companion)?)\s*\.\s*)?`;
const INDEX = String.raw`(\[[^\]\n]*\]\s*)?`;
const TAIL = new RegExp(
  String.raw`^\s*${INDEX}(?:([-+*/%]?)=(?!=)|(\+\+|--)|(?:!!\s*)?\??\.\s*(${MUTATORS})\s*[({])`,
  'u',
);
const DECLARED_BEFORE = /(?:val|var)\s+$/u;
const DECLARATION_WINDOW = 8;
const STEP = 2;

function refPattern(name) {
  return new RegExp(String.raw`(?<![\w.\x60])${QUALIFIER}${escaped(name)}(?![\w\x60])`, 'gu');
}

function qualifiedFine(qualifier, holder) {
  const text = (qualifier ?? '').replaceAll(/\s+/gu, '');
  if (text === '') {
    return true;
  }
  if (holder.scope === 'file') {
    return false;
  }
  const name = holder.klass?.name;
  return ['this.', 'Companion.', `${name}.`, `${name}.Companion.`].includes(text);
}

function shadowed(scanned, name, { from, offset }) {
  const own = escaped(name);
  const pattern = new RegExp(
    [
      String.raw`(?<![\w.\x60])(?:(?:val|var)\s+${own}(?![\w\x60])`,
      String.raw`${own}\s*(?:->|,[^\n]*->)`,
      String.raw`for\s*\(\s*${own}\s+in\b`,
      String.raw`${own}\s*:\s*[A-Z(])`,
    ].join('|'),
    'u',
  );
  return pattern.test(scanned.code.slice(from, offset));
}

function kindOf({ index, operator, call }) {
  if (call !== undefined) {
    return 'call';
  }
  if (index !== undefined) {
    return 'element';
  }
  if (operator === undefined) {
    return 'step';
  }
  return operator === '' ? 'assign' : 'compound';
}

function skipped(scanned, match, operator) {
  const declared = scanned.code.slice(Math.max(0, match.index - DECLARATION_WINDOW), match.index);
  const named = operator === '' && '(,'.includes(previousSignificant(scanned, match.index) ?? ' ');
  return named || DECLARED_BEFORE.test(declared);
}

function hitOf(scanned, holder, match) {
  const tail = TAIL.exec(scanned.code.slice(match.index + match[0].length));
  const before = scanned.code.slice(Math.max(0, match.index - STEP), match.index);
  const prefixed = before === '++' || before === '--';
  if ((tail === null && !prefixed) || !qualifiedFine(match[1], holder)) {
    return undefined;
  }
  const [, index, operator, , call] = tail ?? [];
  if (skipped(scanned, match, operator)) {
    return undefined;
  }
  const kind = kindOf({ index, operator, call });
  return { offset: match.index, kind, call, counts: counts(holder, kind) };
}

function counts(holder, kind) {
  if (kind === 'assign' || kind === 'step') {
    return holder.reassignable;
  }
  if (kind === 'compound') {
    return holder.reassignable || holder.collection;
  }
  return holder.collection;
}

export function hitsIn(scanned, holder, range) {
  const text = scanned.code.slice(range.start, range.end);
  return [...text.matchAll(refPattern(holder.name))]
    .map((match) => ({ ...match, index: match.index + range.start }))
    .filter(
      (match) =>
        !shadowed(scanned, holder.name, { from: range.from ?? range.start, offset: match.index }),
    )
    .map((match) => hitOf(scanned, holder, match))
    .filter((hit) => hit !== undefined && hit.counts);
}

export function isReset(hit) {
  return hit.kind === 'assign' || (hit.kind === 'call' && RESETTERS.has(hit.call));
}

function inScope(scope, offset) {
  return scope.start <= offset && offset < scope.end;
}

function perTestHooks(scanned, scope) {
  const functions = functionsOf(scanned)
    .filter((fn) => inScope(scope, fn.offset))
    .filter(
      (fn) =>
        fn.annotations.some(({ name }) => PER_TEST_ANNOTATIONS.has(name)) ||
        (fn.modifiers.has('override') && PER_TEST_NAMES.has(fn.name)),
    )
    .map((fn) => ({
      start: fn.body.start,
      end: fn.body.end,
      symbol: chainName(classesOf(scanned), fn.offset, fn.name),
    }));
  const lambdas = [...scanned.code.matchAll(PER_TEST_LAMBDA)]
    .filter((match) => inScope(scope, match.index))
    .map((match) => {
      const open = match.index + match[0].length - 1;
      return {
        start: open + 1,
        end: closeOf(scanned, open),
        symbol: chainName(classesOf(scanned), match.index),
      };
    });
  return [...functions, ...lambdas];
}

function calledFrom(scanned, scope, ranges) {
  return functionsOf(scanned)
    .filter((fn) => inScope(scope, fn.offset))
    .filter((fn) => {
      const call = new RegExp(
        String.raw`(?<![\w.\x60])(?:this\s*\.\s*)?${escaped(fn.name)}\s*\(`,
        'u',
      );
      return ranges.some(
        (range) =>
          !(range.start <= fn.offset && fn.offset < range.end) &&
          call.test(scanned.code.slice(range.start, range.end)),
      );
    })
    .map((fn) => ({
      start: fn.body.start,
      end: fn.body.end,
      from: fn.offset,
      symbol: chainName(classesOf(scanned), fn.offset, fn.name),
    }));
}

export function writeSites(scanned, scope, tests) {
  const hooks = perTestHooks(scanned, scope);
  const hookHelpers = calledFrom(scanned, scope, hooks);
  const testRanges = tests.map((test) => ({ ...test.body, symbol: test.symbol }));
  const testHelpers = calledFrom(scanned, scope, testRanges).filter(
    (helper) => !hooks.some((hook) => hook.start === helper.start),
  );
  return {
    resets: [...hooks, ...hookHelpers],
    writes: [...testRanges, ...testHelpers, ...hooks, ...hookHelpers],
  };
}
