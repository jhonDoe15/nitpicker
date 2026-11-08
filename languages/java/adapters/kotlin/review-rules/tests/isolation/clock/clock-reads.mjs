import { splitArguments } from '../../../../scan/kotlin-brackets.mjs';
import { importsOf } from '../../discovery/imports.mjs';
import { closeOf } from '../../discovery/text-scan.mjs';
import { mocksAny } from '../faked.mjs';

const TIME_TYPES =
  'Instant|LocalDate|LocalDateTime|LocalTime|ZonedDateTime|OffsetDateTime|OffsetTime|Year|YearMonth|MonthDay';
const FAKED_TYPES = [
  ...TIME_TYPES.split('|'),
  ...['Clock', 'System', 'Date', 'InstantSource', 'ZoneId', 'Duration', 'ChronoUnit'],
];
const HEAD = String.raw`(?<![\w.\x60])(?:[a-z]\w*\s*\.\s*)*`;
const NOW = new RegExp(String.raw`${HEAD}(${TIME_TYPES})\s*\.\s*now\s*\(`, 'gu');
const FIXED_FORMS = [
  [String.raw`System\s*\.\s*currentTimeMillis\s*\(`, 'System.currentTimeMillis'],
  [String.raw`Clock\s*\.\s*(systemUTC|systemDefaultZone|system)\s*\(`, 'Clock.system'],
  [String.raw`InstantSource\s*\.\s*system\s*\(`, 'InstantSource.system'],
  [String.raw`Clock\s*\.\s*System\s*\.\s*now\s*\(`, 'Clock.System.now'],
].map(([source, family]) => ({ pattern: new RegExp(`${HEAD}${source}`, 'gu'), family }));
const DATE = /(?<![\w.`])((?:java\s*\.\s*util\s*\.\s*)?)Date\s*\(\s*\)/gu;
const ZONE_ARGUMENT = /^(?:[\w.]*\.)?(?:ZoneId|ZoneOffset)\b/u;

export function isFaked(scanned) {
  return mocksAny(scanned, FAKED_TYPES);
}

function readsNow(scanned) {
  return [...scanned.code.matchAll(NOW)].flatMap((match) => {
    const open = match.index + match[0].length - 1;
    const { close, parts } = splitArguments(scanned.code, open);
    const argument = parts.length === 1 ? scanned.source.slice(parts[0].start, parts[0].end) : '';
    const reads = parts.length === 0 || ZONE_ARGUMENT.test(argument.trim());
    return reads ? [{ offset: match.index, end: close + 1, family: `${match[1]}.now` }] : [];
  });
}

function readsFixedForms(scanned) {
  return FIXED_FORMS.flatMap(({ pattern, family }) =>
    [...scanned.code.matchAll(pattern)].map((match) => ({
      offset: match.index,
      end: closeOf(scanned, match.index + match[0].length - 1) + 1,
      family,
    })),
  );
}

function usesJavaDate(scanned, qualified) {
  const imports = importsOf(scanned);
  const explicit = imports.explicit.get('Date');
  return (
    qualified !== '' ||
    explicit === 'java.util.Date' ||
    (explicit === undefined && imports.stars.has('java.util'))
  );
}

function readsDate(scanned) {
  return [...scanned.code.matchAll(DATE)]
    .filter((match) => usesJavaDate(scanned, match[1]))
    .map((match) => ({
      offset: match.index,
      end: match.index + match[0].length,
      family: 'Date',
    }));
}

export function clockReads(scanned) {
  return [...readsNow(scanned), ...readsFixedForms(scanned), ...readsDate(scanned)].toSorted(
    (left, right) => left.offset - right.offset,
  );
}
