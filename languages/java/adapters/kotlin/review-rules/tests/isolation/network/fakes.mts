import type { Span, TestScanned } from '../../typed/discovery-types.mts';
import { groupOf } from '../../typed/indexing.mts';
import { closeOf, remembered } from '../../discovery/text-scan.mts';
import { inRanges } from '../report.mts';

const TRANSPORT_FAKE = /\b(?:MockRestServiceServer|MockEngine)\b/u;
const MOCKK_STUBS = [
  'every coEvery verify coVerify verifyAll coVerifyAll verifyOrder coVerifyOrder',
  'verifySequence coVerifySequence justRun',
].join(' ');
const STUBBING_BLOCKS = new RegExp(
  String.raw`(?<![\w.\x60])(?:${MOCKK_STUBS.split(' ').join('|')})\s*\{`,
  'gu',
);
const STUBBING_CALLS = new RegExp(
  [
    String.raw`(?<![\w\x60])(?:whenever|given|verify|\x60when\x60|doReturn|doThrow|doAnswer)\s*\(`,
    String.raw`Mockito\s*\.\s*when\s*\(`,
  ].join('|'),
  'gu',
);
const MOCK_ANNOTATIONS = 'Mock|MockK|RelaxedMockK|MockkBean|MockBean|MockitoBean';
const ANNOTATED_MOCK = new RegExp(
  [
    String.raw`@(?:\w+:)?(?:${MOCK_ANNOTATIONS})\b(?:\([^()]*\))?\s*`,
    String.raw`(?:(?:private|protected|internal|public|lateinit|override)\s+)*(?:val|var)\s+(\w+)`,
  ].join(''),
  'gu',
);
const CREATED_MOCK =
  /(?:val|var)\s+(\w+)\s*(?::[^=\n]+)?=\s*(?:Mockito\s*\.\s*)?(?:mockk|mock)\s*[<({]/gu;

function typedPattern(types: string): RegExp {
  return new RegExp(
    [
      String.raw`(\w+)\s*:\s*(?:[\w.]*\.)?(?:${types})\b`,
      String.raw`(?:val|var)\s+(\w+)\s*=\s*(?:${types})\b`,
    ].join('|'),
    'gu',
  );
}

export function transportFaked(scanned: TestScanned): boolean {
  return TRANSPORT_FAKE.test(scanned.code);
}

function stubbedRanges(scanned: TestScanned): Span[] {
  return remembered(scanned, 'stubbed-ranges', () => {
    const blocks = [...scanned.code.matchAll(STUBBING_BLOCKS)].map(
      (match) => match.index + match[0].length - 1,
    );
    const calls = [...scanned.code.matchAll(STUBBING_CALLS)].map(
      (match) => match.index + match[0].length - 1,
    );
    return [...blocks, ...calls].map((open) => ({ start: open, end: closeOf(scanned, open) }));
  });
}

export function isStubbed(scanned: TestScanned, offset: number): boolean {
  return inRanges(stubbedRanges(scanned), offset);
}

export function mockNames(scanned: TestScanned): Set<string> {
  return remembered(scanned, 'mock-names', () => {
    const matches = [
      ...scanned.code.matchAll(ANNOTATED_MOCK),
      ...scanned.code.matchAll(CREATED_MOCK),
    ];
    return new Set(matches.map((match) => groupOf(match, 1)));
  });
}

export function namesOfType(scanned: TestScanned, types: string[]): Set<string> {
  const matches = [...scanned.code.matchAll(typedPattern(types.join('|')))];
  return new Set(
    matches.flatMap((match) => {
      const name = match[1] ?? match[2];
      return name === undefined ? [] : [name];
    }),
  );
}
