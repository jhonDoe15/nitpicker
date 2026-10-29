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

function importsMatch(imports, name, pattern) {
  const explicit = imports.explicit.get(name);
  const star = [...imports.stars].some((qualified) => pattern.test(qualified));
  return (explicit !== undefined && pattern.test(explicit)) || star;
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

function directKind(name, { dotted, holder }) {
  if (ASSERT_NAME.test(name) || SHOULD_NAME.test(name) || STRIKT_NAME.test(name)) {
    return 'assert';
  }
  if (SKIP_NAMES.has(name)) {
    return 'skip';
  }
  return FAIL_NAMES.has(name) && (!dotted || ASSERT_HOLDERS.has(holder)) ? 'fail' : undefined;
}

function boundKind(name, { dotted, holder }, { imports, code, offset }) {
  if (name === 'andExpect' || name === 'andExpectAll') {
    return dotted && !isSetup(code, offset) ? 'assert' : undefined;
  }
  if (MOCK_VERIFY.has(name)) {
    const bound = dotted ? MOCK_HOLDERS.has(holder) : importsMatch(imports, name, MOCK_IMPORTS);
    return bound ? 'assert' : undefined;
  }
  return name === 'expect' && !dotted && importsMatch(imports, name, EXPECT_IMPORTS)
    ? 'assert'
    : undefined;
}

function kindOf(name, access, context) {
  return directKind(name, access) ?? boundKind(name, access, context);
}

function callsIn(scanned, from, to) {
  const { code } = scanned;
  const imports = importsOf(scanned);
  const slice = code.slice(from, to);
  const named = [...slice.matchAll(CALL)].flatMap((match) => {
    const offset = from + match.index;
    const kind = kindOf(match[1], receiverOf(scanned, offset), { imports, code, offset });
    return kind === undefined ? [] : [{ name: match[1], kind, offset }];
  });
  const infix = [...slice.matchAll(INFIX)].flatMap((match) =>
    SHOULD_NAME.test(match[1])
      ? [{ name: match[1], kind: 'assert', offset: from + match.index }]
      : [],
  );
  return [...named, ...infix].toSorted((left, right) => left.offset - right.offset);
}

export function assertsIn(scanned, from, to) {
  return callsIn(scanned, from, to).some(({ kind }) => kind === 'assert');
}

export function endsBranch(scanned, from, to) {
  return callsIn(scanned, from, to).length > 0 || THROW.test(scanned.code.slice(from, to));
}
