export const DATETIME_HINTS = [
  {
    tool: 'ruff',
    rules: ['DTZ001'],
    allowed: 'Pass the zone: `datetime(2026, 1, 1, tzinfo=timezone.utc)`.',
  },
  {
    tool: 'ruff',
    rules: ['DTZ002', 'DTZ003'],
    allowed:
      'Read an aware time: `datetime.now(tz=timezone.utc)` in place of `today()` or `utcnow()`.',
  },
  {
    tool: 'ruff',
    rules: ['DTZ004'],
    allowed:
      'Convert to an aware time: `datetime.fromtimestamp(value, tz=timezone.utc)` in place of `utcfromtimestamp(value)`.',
  },
  {
    tool: 'ruff',
    rules: ['DTZ005'],
    allowed: 'Pass the zone: `datetime.now(tz=timezone.utc)`.',
  },
  {
    tool: 'ruff',
    rules: ['DTZ006'],
    allowed: 'Pass the zone: `datetime.fromtimestamp(value, tz=timezone.utc)`.',
  },
  {
    tool: 'ruff',
    rules: ['DTZ007'],
    allowed:
      'Parse the offset with `%z`, attach the known zone with `.replace(tzinfo=...)`, or read a date-only or time-only string with `date.fromisoformat(text)` or `time.fromisoformat(text)`.',
  },
  {
    tool: 'ruff',
    rules: ['DTZ011'],
    allowed:
      "Take the date in the zone it is meant in: `datetime.now(tz=zone).date()`, with `zone` the user's `ZoneInfo(...)` or `timezone.utc`; `date.today()` reads the server's local zone.",
  },
  {
    tool: 'ruff',
    rules: ['DTZ012'],
    allowed:
      "Take the date in the zone it is meant in: `datetime.fromtimestamp(value, tz=zone).date()`, with `zone` the user's `ZoneInfo(...)` or `timezone.utc`; `date.fromtimestamp` reads the server's local zone.",
  },
  {
    tool: 'ruff',
    rules: ['DTZ901'],
    allowed:
      'Attach a zone: `datetime.max.replace(tzinfo=timezone.utc)` (and `datetime.min` likewise).',
  },
];
