import { describe, expect, it } from 'vitest';
import { lineOf, scanKotlinSource } from '../kotlin-source.mjs';
import { defaultTimeZones } from './default-time-zone.mjs';

function found(lines) {
  const source = `class Clocks {\n${lines.map((line) => `    ${line}`).join('\n')}\n}\n`;
  const scanned = scanKotlinSource(source);
  return defaultTimeZones(scanned).map(({ rule, offset }) => [rule, lineOf(scanned, offset)]);
}

describe('defaultTimeZones', () => {
  it.each([
    ['LocalDate.now()', 'fun today() = LocalDate.now()'],
    ['LocalDateTime.now()', 'fun stamp() = LocalDateTime.now().toString()'],
    ['a qualified ZonedDateTime.now()', 'fun stamp() = java.time.ZonedDateTime.now()'],
    ['YearMonth.now()', 'fun month() = YearMonth.now()'],
    ['ZoneId.systemDefault()', 'val zone = ZoneId.systemDefault()'],
    ['Clock.systemDefaultZone()', 'val clock = Clock.systemDefaultZone()'],
    ['java.util.TimeZone.getDefault()', 'val zone = TimeZone.getDefault().id'],
    [
      'kotlinx.datetime currentSystemDefault()',
      'fun today() = Clock.System.todayIn(TimeZone.currentSystemDefault())',
    ],
  ])('flags %s', (_name, line) => {
    expect(found([line])).toEqual([['DefaultTimeZone', 2]]);
  });

  it.each([
    ['a Clock', 'fun today(clock: Clock) = LocalDate.now(clock)'],
    ['a zone', 'fun today() = LocalDate.now(ZoneId.of("UTC"))'],
    ['an Instant', 'fun stamp() = Instant.now()'],
    ['the UTC clock', 'val clock = Clock.systemUTC()'],
    ['kotlinx.datetime UTC', 'fun today() = Clock.System.todayIn(TimeZone.UTC)'],
    ['a configured zone', 'fun zone(name: String) = TimeZone.of(name)'],
    ['a method of another type', 'fun next() = schedule.now()'],
    ['text in a string', 'val hint = "use LocalDate.now() with a clock"'],
    ['a Calendar with a zone', 'val calendar = Calendar.getInstance(TimeZone.getTimeZone("UTC"))'],
    ['a GregorianCalendar with a zone', 'val calendar = GregorianCalendar(zone)'],
    ['a Calendar with a zone variable', 'val calendar = Calendar.getInstance(tz)'],
    ['a Calendar with a zone and a locale', 'val calendar = Calendar.getInstance(utc, Locale.US)'],
    [
      'a SimpleDateFormat variable given a zone',
      'fun format(d: Date): String { val f = SimpleDateFormat("yyyy"); f.timeZone = utc; return f.format(d) }',
    ],
    [
      'a SimpleDateFormat given a zone',
      'fun format() = SimpleDateFormat("yyyy").apply { timeZone = TimeZone.getTimeZone("UTC") }',
    ],
  ])('accepts %s', (_name, line) => {
    expect(found([line])).toEqual([]);
  });

  it.each([
    ['Calendar.getInstance()', 'val calendar = Calendar.getInstance()'],
    ['Calendar.getInstance(locale)', 'val calendar = Calendar.getInstance(Locale.US)'],
    ['GregorianCalendar()', 'val calendar = GregorianCalendar(2024, 0, 1)'],
    ['a SimpleDateFormat', 'fun format(date: Date) = SimpleDateFormat("yyyy-MM-dd").format(date)'],
    [
      'GregorianCalendar with date fields in variables',
      'fun at(y: Int, m: Int, d: Int) = GregorianCalendar(y, m, d)',
    ],
    [
      'a SimpleDateFormat whose neighbour sets a zone',
      'fun format(d: Date): String { val f = SimpleDateFormat("yyyy"); val g = SimpleDateFormat("MM"); g.timeZone = utc; return f.format(d) + g.format(d) }',
    ],
  ])('flags the legacy %s', (_name, line) => {
    expect(found([line])).toEqual([['LegacyCalendarApi', 2]]);
  });
});
