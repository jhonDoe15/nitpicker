import type { TestScanned } from '../../typed/discovery-types.mts';
import { groupOf } from '../../typed/indexing.mts';
import type { ClockHit } from '../../typed/rule-types.mts';
import { splitArguments } from '../../../../scan/kotlin-brackets.mts';
import { importsOf } from '../../discovery/imports.mts';
import { closeOf } from '../../discovery/text-scan.mts';
import { mocksAny } from '../faked.mts';
import { HEAD, fixedForms } from '../fixed-forms.mts';

const TIME_TYPES =
  'Instant|LocalDate|LocalDateTime|LocalTime|ZonedDateTime|OffsetDateTime|OffsetTime|Year|YearMonth|MonthDay';
const FAKED_TYPES = [
  ...TIME_TYPES.split('|'),
  ...['Clock', 'System', 'Date', 'InstantSource', 'ZoneId', 'Duration', 'ChronoUnit'],
];
const NOW = new RegExp(String.raw`${HEAD}(${TIME_TYPES})\s*\.\s*now\s*\(`, 'gu');
const FIXED_FORMS = fixedForms([
  [/System\s*\.\s*currentTimeMillis\s*\(/u, 'System.currentTimeMillis'],
  [/Clock\s*\.\s*(systemUTC|systemDefaultZone|system)\s*\(/u, 'Clock.system'],
  [/InstantSource\s*\.\s*system\s*\(/u, 'InstantSource.system'],
  [/Clock\s*\.\s*System\s*\.\s*now\s*\(/u, 'Clock.System.now'],
]);
const DATE = /(?<![\w.`])((?:java\s*\.\s*util\s*\.\s*)?)Date\s*\(\s*\)/gu;
const ZONE_ARGUMENT = /^(?:[\w.]*\.)?(?:ZoneId|ZoneOffset)\b/u;

export function isFaked(scanned: TestScanned): boolean {
  return mocksAny(scanned, FAKED_TYPES);
}

function readsNow(scanned: TestScanned): ClockHit[] {
  return [...scanned.code.matchAll(NOW)].flatMap((match) => {
    const open = match.index + match[0].length - 1;
    const { close, parts } = splitArguments(scanned.code, open);
    const only = parts[0];
    const argument =
      parts.length === 1 && only !== undefined ? scanned.source.slice(only.start, only.end) : '';
    const reads = parts.length === 0 || ZONE_ARGUMENT.test(argument.trim());
    return reads
      ? [{ offset: match.index, end: close + 1, family: `${groupOf(match, 1)}.now` }]
      : [];
  });
}

function readsFixedForms(scanned: TestScanned): ClockHit[] {
  return FIXED_FORMS.flatMap(({ pattern, family }) =>
    [...scanned.code.matchAll(pattern)].map((match) => ({
      offset: match.index,
      end: closeOf(scanned, match.index + match[0].length - 1) + 1,
      family,
    })),
  );
}

function usesJavaDate(scanned: TestScanned, qualified: string): boolean {
  const imports = importsOf(scanned);
  const explicit = imports.explicit.get('Date');
  return (
    qualified !== '' ||
    explicit === 'java.util.Date' ||
    (explicit === undefined && imports.stars.has('java.util'))
  );
}

function readsDate(scanned: TestScanned): ClockHit[] {
  return [...scanned.code.matchAll(DATE)]
    .filter((match) => usesJavaDate(scanned, groupOf(match, 1)))
    .map((match) => ({
      offset: match.index,
      end: match.index + match[0].length,
      family: 'Date',
    }));
}

export function clockReads(scanned: TestScanned): ClockHit[] {
  return [...readsNow(scanned), ...readsFixedForms(scanned), ...readsDate(scanned)].toSorted(
    (left, right) => left.offset - right.offset,
  );
}
