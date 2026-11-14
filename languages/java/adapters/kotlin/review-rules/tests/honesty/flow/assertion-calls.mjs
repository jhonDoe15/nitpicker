import { importsOf } from '../../discovery/imports.mjs';
import { trimmedEnd, wordBefore } from '../../discovery/text-scan.mjs';

const CALL = /(?<![\w`])([A-Za-z_]\w*)\s*(?:<[^<>()]*>\s*)?(?=[({])/gu;
const INFIX = /(?<=[\w)\]"}][ \t]+)(should(?:Not)?(?:[A-Z]\w*)?)(?=[ \t]+[\w"'([{-])/gu;
const ASSERT_NAME = /^assert(?:[A-Z]\w*)?$/u;
const SHOULD_VERBS =
  'Be|Have|Contain|Match|StartWith|EndWith|Throw|Fail|Exist|Include|Equal|Satisfy|Succeed|Compile|Hold|Pass|Return';
const SHOULD_NAME = new RegExp(String.raw`^should(?:Not)?(?:(?:${SHOULD_VERBS})\w*)?$`, 'u');
const STRIKT_NAME = /^expect(?:Thr?ows|Catching|That)$/u;
const MOCK_VERIFY = new Set(
  [
    'verify coVerify verifyAll coVerifyAll verifyOrder coVerifyOrder verifySequence coVerifySequence',
    'confirmVerified coConfirmVerified verifyNoMoreInteractions verifyNoInteractions verifyZeroInteractions',
  ]
    .join(' ')
    .split(' '),
);
const MOCK_HOLDERS = new Set(['Mockito', 'BDDMockito', 'MockK', 'mockk']);
const ASSERT_HOLDERS = new Set(['Assertions', 'Assert', 'Assumptions']);
const MOCK_IMPORTS = /^(?:io\.mockk|org\.mockito)/u;
const EXPECT_IMPORTS = /^(?:kotlin\.test|strikt\.api)/u;
const FAIL_NAMES = new Set(['fail', 'error', 'TODO']);
const SKIP_NAMES = new Set(['assumeTrue', 'assumeFalse', 'assumeThat', 'assumeNotNull', 'abort']);
const SETUP_WINDOW = 800;
const THROW = /(?<![\w.])throw\b/u;
const NO_NAMES = new Set();
const ASSERT_KIND = 'assert';

const STDLIB = /^(?:kotlin|java|javax|kotlinx)\./u;
const DECLARATION = /\bfun\s+(?:<[^>]*>\s*)?(?:[\w.]+\.)?$/u;
const DECLARATION_WINDOW = 40;
const EXPECT_NAME = /^expect[A-Z]\w*$/u;

function importsMatch(imports, qualified, pattern) {
  const star = [...imports.stars].some((starred) => pattern.test(starred));
  return (qualified !== undefined && pattern.test(qualified)) || star;
}

function receiverOf(scanned, index) {
  const { code } = scanned;
  const before = trimmedEnd(scanned, index);
  const dotted = code[before - 1] === '.';
  const dot = code[before - 2] === '?' ? before - 2 : before - 1;
  return dotted ? { dotted, holder: wordBefore(scanned, dot).word } : { dotted, holder: '' };
}

function isSetup(code, offset) {
  const after = code.slice(offset, offset + SETUP_WINDOW).split(/\n\s*\n/u)[0];
  const before = code
    .slice(Math.max(0, offset - SETUP_WINDOW), offset)
    .split(/\n\s*\n/u)
    .at(-1);
  return /\.\s*andRespond\b/u.test(after) || /\bexpect\s*\(/u.test(before);
}

function directKind(name, { dotted, holder }, { assertionNames }) {
  const conventional = assertionNames.has(name) && (!dotted || holder === 'this');
  if (ASSERT_NAME.test(name) || SHOULD_NAME.test(name) || STRIKT_NAME.test(name) || conventional) {
    return ASSERT_KIND;
  }
  if (SKIP_NAMES.has(name)) {
    return 'skip';
  }
  return FAIL_NAMES.has(name) && (!dotted || ASSERT_HOLDERS.has(holder)) ? 'fail' : undefined;
}

function isMockVerification(dotted, holder, { imports, qualified }) {
  return dotted ? MOCK_HOLDERS.has(holder) : importsMatch(imports, qualified, MOCK_IMPORTS);
}

function isImportedExpectation(name, dotted, { imports, code, offset, qualified }) {
  const declaration = DECLARATION.test(
    code.slice(Math.max(0, offset - DECLARATION_WINDOW), offset),
  );
  const known = qualified !== undefined || [...imports.stars].some((star) => !STDLIB.test(star));
  return !dotted && !declaration && known && EXPECT_NAME.test(name);
}

function boundKind(name, { dotted, holder }, context) {
  const { imports, code, offset, qualified } = context;
  if (name === 'andExpect' || name === 'andExpectAll') {
    return dotted && !isSetup(code, offset) ? ASSERT_KIND : undefined;
  }
  if (MOCK_VERIFY.has(name)) {
    return isMockVerification(dotted, holder, context) ? ASSERT_KIND : undefined;
  }
  if (name === 'expect') {
    return !dotted && importsMatch(imports, qualified, EXPECT_IMPORTS) ? ASSERT_KIND : undefined;
  }
  return isImportedExpectation(name, dotted, context) ? ASSERT_KIND : undefined;
}

function kindOf(written, access, context) {
  const alias = context.imports.aliases.get(written);
  const name = alias?.target ?? written;
  const qualified = alias?.qualified ?? context.imports.explicit.get(name);
  return directKind(name, access, context) ?? boundKind(name, access, { ...context, qualified });
}

function namedCalls(scanned, from, to) {
  const { code } = scanned;
  const imports = importsOf(scanned);
  const assertionNames = scanned.assertionNames ?? NO_NAMES;
  return [...code.slice(from, to).matchAll(CALL)].flatMap((match) => {
    const offset = from + match.index;
    const context = { imports, code, offset, assertionNames };
    const kind = kindOf(match[1], receiverOf(scanned, offset), context);
    return kind === undefined ? [] : [{ name: match[1], kind, offset }];
  });
}

function infixCalls(scanned, from, to) {
  return [...scanned.code.slice(from, to).matchAll(INFIX)]
    .filter((match) => SHOULD_NAME.test(match[1]))
    .map((match) => ({ name: match[1], kind: ASSERT_KIND, offset: from + match.index }));
}

function callsIn(scanned, from, to) {
  const named = namedCalls(scanned, from, to);
  return [...named, ...infixCalls(scanned, from, to)].toSorted(
    (left, right) => left.offset - right.offset,
  );
}

export function assertsIn(scanned, from, to) {
  return callsIn(scanned, from, to).some(({ kind }) => kind === ASSERT_KIND);
}

export function endsBranch(scanned, from, to) {
  return callsIn(scanned, from, to).length > 0 || THROW.test(scanned.code.slice(from, to));
}
