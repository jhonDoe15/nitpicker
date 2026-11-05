import { closingIndex, enclosingOpen, splitArguments } from '../kotlin-source.mjs';

const NOW_TYPES = [
  'LocalDate',
  'LocalDateTime',
  'LocalTime',
  'MonthDay',
  'OffsetDateTime',
  'OffsetTime',
  'Year',
  'YearMonth',
  'ZonedDateTime',
];
const DEFAULT_ZONE_CALLS = [
  new RegExp(
    String.raw`(?<![\w.])(?:java\.time\.)?(?:${NOW_TYPES.join('|')})\s*\.\s*now\s*\(\s*\)`,
    'g',
  ),
  /(?<![\w.])(?:java\.time\.)?Clock\s*\.\s*systemDefaultZone\s*\(\s*\)/g,
  /(?<![\w.])(?:java\.time\.)?ZoneId\s*\.\s*systemDefault\s*\(\s*\)/g,
  /(?<![\w.])(?:java\.util\.)?TimeZone\s*\.\s*getDefault\s*\(\s*\)/g,
  /(?<![\w.])(?:kotlinx\.datetime\.)?TimeZone\s*\.\s*currentSystemDefault\s*\(\s*\)/g,
];
const CALENDAR_CALL =
  /(?<![\w.])(?:java\.util\.)?(?:Calendar\s*\.\s*getInstance|GregorianCalendar)\s*\(/g;
const DATE_FORMAT_CALL = /(?<![\w.])(?:java\.text\.)?SimpleDateFormat\s*\(/g;
const ZONE_ARGUMENT = /TimeZone|[Zz]one\b/;
const ZONE_SETTING = /\btimeZone\s*=|\.\s*setTimeZone\s*\(/;

export const TIME_ZONE_MESSAGES = {
  DefaultTimeZone:
    'Pass a `Clock` or a zone: `LocalDate.now(clock)` with an injected `Clock` (`Clock.systemUTC()` in production, `Clock.fixed(...)` in tests), `ZoneId.of("UTC")` or a configured zone, and with kotlinx.datetime `TimeZone.UTC` or `TimeZone.of(configuredZone)`. This reads the JVM\'s default time zone, so the result changes with the server\'s `TZ` or `-Duser.timezone`.',
  LegacyCalendarApi:
    'Use java.time with an explicit zone: `Instant`, `ZonedDateTime.now(clock)`, and a `DateTimeFormatter` with `withZone(zone)`. `Calendar.getInstance()` and `GregorianCalendar()` without a `TimeZone`, and a `SimpleDateFormat` whose `timeZone` is never set, read the default time zone, and `SimpleDateFormat` is not thread-safe.',
};

function defaultZoneCalls(code) {
  return DEFAULT_ZONE_CALLS.flatMap((pattern) =>
    [...code.matchAll(pattern)].map((match) => ({ rule: 'DefaultTimeZone', offset: match.index })),
  );
}

function namesZone(code, match) {
  const { parts } = splitArguments(code, match.index + match[0].length - 1);
  return parts.some(({ start, end }) => ZONE_ARGUMENT.test(code.slice(start, end)));
}

function setsZoneNearby(code, offset) {
  const block = enclosingOpen(code, offset);
  const scope = block === -1 ? code : code.slice(block, closingIndex(code, block));
  return ZONE_SETTING.test(scope);
}

function legacyCalendarCalls(code) {
  const calendars = [...code.matchAll(CALENDAR_CALL)].filter((match) => !namesZone(code, match));
  const formats = [...code.matchAll(DATE_FORMAT_CALL)].filter(
    (match) => !setsZoneNearby(code, match.index),
  );
  return [...calendars, ...formats].map((match) => ({
    rule: 'LegacyCalendarApi',
    offset: match.index,
  }));
}

export function defaultTimeZones(scanned) {
  return [...defaultZoneCalls(scanned.code), ...legacyCalendarCalls(scanned.code)];
}
