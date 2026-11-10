import { splitArguments } from '../../../../scan/kotlin-source.mjs';
import { closeOf, execAt, skipSpace } from '../../discovery/text-scan.mjs';
import { argumentCalls, dotReceiver } from './call-scan.mjs';

const VERIFY =
  /(?<![\w`])(?:verify|coVerify|verifyAll|coVerifyAll|verifyOrder|coVerifyOrder|verifySequence|coVerifySequence)(?![\w`])/gu;
const MATCHER_NAMES = [
  'any anyOrNull ofType allAny anyVararg anyString anyInt anyLong anyDouble anyFloat anyBoolean anyByte',
  'anyShort anyChar anyList anyMap anySet anyCollection anyIterable',
].join(' ');
const ANY_MATCHER = new RegExp(
  String.raw`^(?:\w+\s*=\s*)?\*?(?:${MATCHER_NAMES.split(' ').join('|')})\s*(?:<.*>)?\s*\([\w.:<>]*\)$`,
  'u',
);
const MATCHERS = new Set([...MATCHER_NAMES.split(' '), 'eq', 'match', 'slot', 'capture', 'isNull']);
const MOCKK_NEGATIVE = /\bexactly\s*=\s*0\b|\binverse\s*=\s*true\b|\batMost\s*=/u;
const MOCKITO_NEGATIVE = /\bnever\s*\(|\batMost(?:Once)?\s*\(|\btimes\s*\(\s*0\s*\)/u;
const VERIFIED_CALL = /\s*\.\s*(?:\?\.)?([A-Za-z_]\w*)\s*(?:<[^<>()]*>\s*)?(?=\()/y;
const THEN_ROOT = /^(?:\w+\.)*then\s*\(/u;
const UPPER = /^[A-Z]/u;

function allAny(args) {
  return args.length > 0 && args.every((argument) => ANY_MATCHER.test(argument));
}

function groupsIn(scanned, { start, end }) {
  return [...scanned.code.slice(start, end).matchAll(/[([{]/gu)].map(({ index }) => ({
    open: start + index,
    close: closeOf(scanned, start + index),
  }));
}

function isNested(groups, call) {
  return groups.some((group) => group.open < call.offset && call.offset < group.close);
}

function blockCalls(scanned, open) {
  const range = { start: open + 1, end: closeOf(scanned, open) };
  const groups = groupsIn(scanned, range);
  return argumentCalls(scanned, range)
    .filter(
      (call) =>
        !isNested(groups, call) &&
        !MATCHERS.has(call.name) &&
        !UPPER.test(call.name) &&
        allAny(call.args),
    )
    .map((call) => ({ offset: call.offset, form: `verify-${call.name}` }));
}

function chainedCall(scanned, from) {
  const { code } = scanned;
  const head = execAt(code, VERIFIED_CALL, from);
  if (head === null) {
    return [];
  }
  const open = from + head[0].length;
  const { parts } = splitArguments(code, open);
  const args = parts.map(({ start, end }) => code.slice(start, end).trim());
  return allAny(args) ? [{ offset: skipSpace(code, from), form: `verify-${head[1]}` }] : [];
}

function verifyForms(scanned, match, start) {
  const { code } = scanned;
  const at = skipSpace(code, start + match[0].length);
  const hasArgs = code[at] === '(';
  const close = hasArgs ? splitArguments(code, at).close : at - 1;
  const text = code.slice(at + 1, close);
  const after = skipSpace(code, close + 1);
  if (code[after] === '{') {
    return MOCKK_NEGATIVE.test(text) ? [] : blockCalls(scanned, after);
  }
  return hasArgs && code[after] === '.' && !MOCKITO_NEGATIVE.test(text)
    ? chainedCall(scanned, close + 1)
    : [];
}

function shouldForms(scanned, call) {
  const receiver = dotReceiver(scanned, call.offset);
  const negative = MOCKITO_NEGATIVE.test(scanned.code.slice(call.open, call.close));
  return receiver !== undefined && THEN_ROOT.test(receiver.text) && !negative
    ? chainedCall(scanned, call.close + 1)
    : [];
}

export function calledChecks(scanned, body) {
  const { code } = scanned;
  const verifies = [...code.slice(body.start, body.end).matchAll(VERIFY)].flatMap((match) =>
    verifyForms(scanned, match, body.start + match.index),
  );
  const shoulds = argumentCalls(scanned, body)
    .filter(({ name }) => name === 'should')
    .flatMap((call) => shouldForms(scanned, call));
  return [...verifies, ...shoulds];
}
