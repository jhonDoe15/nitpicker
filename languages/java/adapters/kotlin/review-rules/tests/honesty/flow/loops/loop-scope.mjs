import { functionOwners, functionsOf } from '../../../discovery/functions.mjs';
import { closeOf, repeatUntil, skipSpace } from '../../../discovery/text-scan.mjs';
import { assertsIn } from '../assertion-calls.mjs';
import { constructsIn } from '../flow-constructs.mjs';

const INT = String.raw`(-?\d[\d_]*)L?`;
const RANGE = String.raw`${INT}\s*(\.\.<|\.\.|until|downTo)\s*${INT}(?:\s+step\s+\d[\d_]*L?)?`;
const FOR_RANGE = new RegExp(String.raw`^\s*\w+\s+in\s+(?:\(\s*${RANGE}\s*\)|${RANGE})\s*$`, 'u');
const RANGE_RECEIVER = new RegExp(String.raw`\(\s*${RANGE}\s*\)\s*$`, 'u');
const REPEAT_COUNT = /^repeat\s*\(\s*(\d[\d_]*)\s*\)/u;
const DO = /^do\b/u;
const RECEIVER_WINDOW = 120;
const PROPERTY_CALL =
  /(?<![\w.`])(?:checkAll|forAll|forNone|forOne|forSome)(?:\s*<[^<>()]*>)?\s*(?=[({])/gu;
const ASSERT_ALL = /(?<![\w.`])assertAll\s*(?=\()/gu;
const CALL = /(?<![\w.`:])(?:this\s*\.\s*)?([A-Za-z_]\w*)\s*(?=[({])/gu;
const REFERENCE = /(?<![\w.`])(?:this\s*)?::\s*([A-Za-z_]\w*)/gu;
const FIRST_STEPS = new Map([
  ['..', (first, last) => last >= first],
  ['..<', (first, last) => last > first],
  ['until', (first, last) => last > first],
  ['downTo', (first, last) => first >= last],
]);

function number(text) {
  return Number(text.replaceAll('_', ''));
}

function nonEmpty(match) {
  if (match === null) {
    return false;
  }
  const values = match.slice(1).filter((part) => part !== undefined);
  const [first, operator, last] = values;
  return FIRST_STEPS.get(operator)(number(first), number(last));
}

export function runsAtLeastOnce(scanned, construct) {
  const { code } = scanned;
  const start = code.slice(construct.from, construct.from + RECEIVER_WINDOW);
  if (construct.construct !== 'loop') {
    return false;
  }
  if (DO.test(start)) {
    return true;
  }
  const repeat = REPEAT_COUNT.exec(start);
  if (repeat !== null) {
    return number(repeat[1]) > 0;
  }
  const { header } = construct;
  if (header !== undefined) {
    return nonEmpty(FOR_RANGE.exec(code.slice(header.start, header.end)));
  }
  const receiver = code.slice(Math.max(0, construct.from - RECEIVER_WINDOW), construct.from);
  return nonEmpty(RANGE_RECEIVER.exec(receiver));
}

function callRanges(scanned, body, pattern) {
  const { code } = scanned;
  return [...code.slice(body.start, body.end).matchAll(pattern)].map((match) => {
    const open = body.start + match.index + match[0].length;
    const close = closeOf(scanned, open);
    const lambda = code[open] === '(' ? skipSpace(code, close + 1) : -1;
    const end = code[lambda] === '{' ? closeOf(scanned, lambda) : close;
    return { start: body.start + match.index, end };
  });
}

export function exemptRanges(scanned, body) {
  return [...callRanges(scanned, body, PROPERTY_CALL), ...callRanges(scanned, body, ASSERT_ALL)];
}

export function insideAny(ranges, offset) {
  return ranges.some(({ start, end }) => offset > start && offset < end);
}

function inside(range, offset) {
  return offset >= range.start && offset < range.end;
}

function namesIn(pattern, text) {
  return [...text.matchAll(pattern)].map((match) => match[1]);
}

function nestedIn(outer, klass) {
  return klass !== undefined && outer.bodyOpen < klass.offset && klass.offset < outer.bodyClose;
}

function helperIndex(scanned, tests) {
  const owners = functionOwners(scanned);
  const all = functionsOf(scanned);
  const bodies = [...tests.map(({ body }) => body), ...all.map(({ body }) => body)];
  const helpers = all
    .filter((fn) => !tests.some(({ offset }) => offset === fn.offset))
    .filter((fn) => !bodies.some((body) => body !== fn.body && inside(body, fn.offset)))
    .map((fn) => ({ ...fn, owner: owners.get(fn.offset) }));
  return { helpers, byName: Map.groupBy(helpers, ({ name }) => name) };
}

function visible(candidates, owner) {
  const members =
    owner === undefined
      ? []
      : candidates.filter(
          (fn) => fn.owner !== undefined && (fn.owner === owner || nestedIn(owner, fn.owner)),
        );
  const scoped = members.length > 0 ? members : candidates.filter((fn) => fn.owner === undefined);
  return scoped.length === 1 ? scoped : [];
}

function resolvedCalls(scanned, index, range, owner) {
  const text = scanned.code.slice(range.start, range.end);
  const local = new Set(
    functionsOf(scanned)
      .filter((fn) => inside(range, fn.offset))
      .map(({ name }) => name),
  );
  const names = new Set([...namesIn(CALL, text), ...namesIn(REFERENCE, text)]);
  return [...names]
    .filter((name) => !local.has(name))
    .flatMap((name) => visible(index.byName.get(name) ?? [], owner));
}

function assertingHelpers(scanned, index) {
  const { helpers } = index;
  const callees = new Map(
    helpers.map((fn) => [fn, resolvedCalls(scanned, index, fn.body, fn.owner)]),
  );
  const asserting = new Set(helpers.filter((fn) => assertsIn(scanned, fn.body.start, fn.body.end)));
  repeatUntil(helpers.length + 1, () => {
    const grown = helpers.filter(
      (fn) => !asserting.has(fn) && callees.get(fn).some((callee) => asserting.has(callee)),
    );
    for (const fn of grown) {
      asserting.add(fn);
    }
    return grown.length === 0;
  });
  return { asserting, callees };
}

function reachedHelpers(found, start) {
  const reached = new Set();
  const pending = [...start];
  for (const fn of pending) {
    if (!reached.has(fn)) {
      reached.add(fn);
      pending.push(...found.callees.get(fn));
    }
  }
  return [...reached];
}

export function outermost(found) {
  return found.filter(
    (entry, index) =>
      !found.slice(0, index).some((outer) => outer.from <= entry.from && entry.to <= outer.to),
  );
}

function ownerOfTest(owners, test) {
  return test.framework === 'junit' ? owners.get(test.offset) : test.suite?.klass;
}

function helperName(fn) {
  return fn.owner === undefined ? fn.name : `${fn.owner.name}.${fn.name}`;
}

function loopsIn(scanned, fn, callsAsserting) {
  const exempt = exemptRanges(scanned, fn.body);
  const loops = constructsIn(scanned, fn.body).filter(
    (entry) =>
      entry.construct === 'loop' &&
      entry.to <= fn.body.end + 1 &&
      !insideAny(exempt, entry.from) &&
      !runsAtLeastOnce(scanned, entry) &&
      entry.scans.some(
        (range) => assertsIn(scanned, range.start, range.end) || callsAsserting(range, fn.owner),
      ),
  );
  return outermost(loops.toSorted((left, right) => left.from - right.from || right.to - left.to));
}

export function loopScope(scanned, tests) {
  const index = helperIndex(scanned, tests);
  const found = assertingHelpers(scanned, index);
  const owners = functionOwners(scanned);
  const reported = new Set();
  function callsAsserting(range, owner) {
    return resolvedCalls(scanned, index, range, owner).some((fn) => found.asserting.has(fn));
  }
  function helperLoops(test) {
    const owner = ownerOfTest(owners, test);
    const entries = reachedHelpers(found, resolvedCalls(scanned, index, test.body, owner)).flatMap(
      (fn) =>
        loopsIn(scanned, fn, callsAsserting).map((loop) => ({ ...loop, helper: helperName(fn) })),
    );
    const fresh = entries.filter((loop) => !reported.has(loop.from));
    for (const loop of fresh) {
      reported.add(loop.from);
    }
    return fresh;
  }
  return {
    callsAsserting: (range, test) => callsAsserting(range, ownerOfTest(owners, test)),
    helperLoops,
  };
}
