import { classesOf } from '../discovery/declarations.mjs';
import { functionOwners, functionsOf } from '../discovery/functions.mjs';
import { enclosingHosts } from '../discovery/hosts.mjs';
import { closeOf, marksFrom } from '../discovery/text-scan.mjs';
import { familyOf, isJdkGlobal, memberAccesses, memberFamily } from './state-changes.mjs';

const AFTER_ANNOTATIONS = new Set([
  'AfterEach',
  'AfterAll',
  'After',
  'AfterClass',
  'AfterMethod',
  'AfterTest',
  'AfterSuite',
  'AfterGroups',
]);
const AFTER_NAMES = new Set([
  'afterEach',
  'afterAll',
  'afterTest',
  'afterSpec',
  'afterContainer',
  'afterAny',
  'afterTestExecution',
  'afterTestMethod',
  'afterTestClass',
  'after',
  'close',
  'tearDown',
]);
const KOTEST_AFTER = new RegExp(
  [
    String.raw`(?<![\w.])(?:afterTest|afterEach|afterSpec|afterContainer|afterAny|afterInvocation`,
    String.raw`|finalizeSpec)\s*(?:\([^()]*\)\s*)?\{`,
  ].join(''),
  'gu',
);
const FINALLY = /(?<![\w.])finally\s*\{/gu;
const LOCAL_CALL = /(?<![\w.])([a-z_]\w*)\s*\(/gu;
const STUB_FIELD = /@(?:get:|field:)?(?:SystemStub|Rule|ClassRule|RegisterExtension)\b/u;
const EXTENSIONS = new Map([
  [
    'System.property',
    [
      'RestoreSystemProperties',
      'SystemProperties',
      'ProvideSystemProperty',
      'ClearSystemProperties',
      'restoreSystemProperties',
      'withSystemProperty',
      'withSystemProperties',
      'SystemPropertyTestListener',
    ],
  ],
  ['Locale.default', ['DefaultLocale', 'LocaleTestListener']],
  ['TimeZone.default', ['DefaultTimeZone', 'TimeZoneTestListener']],
  [
    'System.out',
    [
      'SystemOut',
      'SystemOutRule',
      'SystemErrAndOut',
      'StdIo',
      'tapSystemOut',
      'tapSystemOutNormalized',
      'tapSystemErrAndOut',
      'tapSystemErrAndOutNormalized',
      'captureStandardOut',
    ],
  ],
  [
    'System.err',
    [
      'SystemErr',
      'SystemErrRule',
      'SystemErrAndOut',
      'tapSystemErr',
      'tapSystemErrNormalized',
      'tapSystemErrAndOut',
      'tapSystemErrAndOutNormalized',
      'captureStandardErr',
    ],
  ],
  ['System.in', ['SystemIn', 'TextFromStandardInputStream', 'StdIo', 'withTextFromSystemIn']],
]);
const ANNOTATION_ONLY = new Set(['DefaultLocale', 'DefaultTimeZone', 'StdIo']);
const TYPED_MARKS = [...new Set([...EXTENSIONS.values()].flat())].filter(
  (name) => /^[A-Z]/u.test(name) && !ANNOTATION_ONLY.has(name),
);

function blocks(scanned, pattern, { start: from, end: to }) {
  return [...marksFrom(scanned.code, pattern, from)]
    .filter(({ index }) => index < to)
    .map(({ index, 0: text }) => {
      const open = index + text.length - 1;
      return { start: open + 1, end: closeOf(scanned, open) };
    });
}

function inside(range, offset) {
  return range.start <= offset && offset < range.end;
}

function rangeOf(klass) {
  return { start: klass.offset, end: klass.end };
}

function afterZones(scanned, klass) {
  const body = rangeOf(klass);
  const owners = functionOwners(scanned);
  const functions = functionsOf(scanned).filter((fn) => owners.get(fn.offset) === klass);
  const afters = functions
    .filter(
      (fn) =>
        AFTER_NAMES.has(fn.name) || fn.annotations.some(({ name }) => AFTER_ANNOTATIONS.has(name)),
    )
    .map(({ body: range }) => range);
  const zones = [...afters, ...blocks(scanned, KOTEST_AFTER, body)];
  const called = new Set(
    zones.flatMap(({ start, end }) =>
      [...scanned.code.slice(start, end).matchAll(LOCAL_CALL)].map((match) => match[1]),
    ),
  );
  const helpers = functions.filter((fn) => called.has(fn.name)).map(({ body: range }) => range);
  return [...zones, ...helpers];
}

function marksAround(scanned, { classes, fn, hosts }) {
  const classText = classes.map((klass) => scanned.code.slice(klass.offset, klass.end));
  const stubbed = classText.some((text) => STUB_FIELD.test(text));
  const typed = TYPED_MARKS.filter((name) =>
    classText.some((text) => new RegExp(String.raw`\b${name}\b`, 'u').test(text)),
  );
  return new Set([
    ...[...classes, ...(fn === undefined ? [] : [fn])].flatMap(({ annotations }) =>
      annotations.map(({ name }) => name),
    ),
    ...typed.filter((name) => stubbed || name.endsWith('Listener')),
    ...hosts.map(({ name }) => name),
    ...hosts
      .filter(({ name }) => name === 'execute')
      .flatMap(({ receiver }) => receiver.match(/\w+/gu) ?? []),
  ]);
}

function restoredBy(change, accesses) {
  const family = familyOf(change);
  return accesses.some(
    (access) =>
      access.offset !== change.offset &&
      (familyOf(access) === family ||
        (!isJdkGlobal(change) &&
          access.type === change.type &&
          memberFamily(access.type, access.member) === '')),
  );
}

function usesOwner(hosts, change, extensions) {
  return hosts.some(
    ({ name, receiver }) =>
      name === 'use' &&
      (receiver.match(/\w+/gu) ?? []).some(
        (word) => word === change.type || extensions.includes(word),
      ),
  );
}

export function functionAround(scanned, offset) {
  return functionsOf(scanned)
    .filter(({ body }) => inside(body, offset))
    .toSorted((left, right) => right.body.start - left.body.start)[0];
}

export function isRestored(scanned, change, suites) {
  const classes = classesOf(scanned).filter((klass) => inside(rangeOf(klass), change.offset));
  const fn = functionAround(scanned, change.offset);
  const scope = fn?.body ?? { start: 0, end: scanned.code.length };
  const sites = [
    ...classes.flatMap((klass) => afterZones(scanned, klass)),
    ...blocks(scanned, FINALLY, scope),
  ];
  const hosts = enclosingHosts(scanned, 0, change.offset);
  const marks = marksAround(scanned, { classes, fn, hosts });
  const extensions = EXTENSIONS.get(familyOf(change)) ?? [];
  if (
    sites.some((zone) => inside(zone, change.offset)) ||
    usesOwner(hosts, change, extensions) ||
    extensions.some((name) => marks.has(name))
  ) {
    return true;
  }
  const inSuite = suites.some(({ klass }) => inside(rangeOf(klass), change.offset));
  const zones = inSuite ? sites : [{ start: 0, end: scanned.code.length }];
  return restoredBy(
    change,
    zones.flatMap(({ start, end }) => memberAccesses(scanned.code, start, end)),
  );
}
