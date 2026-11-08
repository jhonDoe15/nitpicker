import { describe, expect, it } from 'vitest';
import { lineOf, scanKotlinSource } from '../../kotlin-source.mjs';
import { timeUnitMismatches } from './time-units.mjs';

function found(lines, imports = []) {
  const header = imports.map((line) => `${line}\n`).join('');
  const source = `${header}class Sessions {\n${lines.map((line) => `    ${line}`).join('\n')}\n}\n`;
  const scanned = scanKotlinSource(source);
  return timeUnitMismatches(scanned).map(
    ({ offset }) => lineOf(scanned, offset) - imports.length - 1,
  );
}

function messages(lines) {
  return timeUnitMismatches(scanKotlinSource(lines.join('\n'))).map(({ message }) => message);
}

describe('timeUnitMismatches', () => {
  it.each([
    [
      'millis compared with seconds',
      'fun expired(lastSeen: Long, realm: Realm) = System.currentTimeMillis() - realm.maxDeltaTimeSeconds > lastSeen',
    ],
    [
      'a getter in seconds added to millis',
      'fun at(ttl: Realm) = Instant.now().toEpochMilli() + ttl.getMaxAgeSeconds()',
    ],
    ['nanos against millis', 'fun late(timeoutMillis: Long) = System.nanoTime() > timeoutMillis'],
    [
      'a whole-seconds duration against millis',
      'fun late(elapsed: Duration, limitMs: Long) = elapsed.inWholeSeconds > limitMs',
    ],
    [
      'a field in millis set from seconds',
      'fun lock(text: String) { lockWaitTimeoutMillis = parseDuration(text).toSeconds() }',
    ],
    ['a val in millis from seconds', 'val timeoutMs: Long = config.timeoutSeconds'],
    [
      'an argument to Thread.sleep in seconds',
      'fun pause(pauseSeconds: Long) { Thread.sleep(pauseSeconds) }',
    ],
    ['seconds into Duration.ofMillis', 'fun ttl(ttlSeconds: Long) = Duration.ofMillis(ttlSeconds)'],
    [
      'a millis value next to TimeUnit.SECONDS',
      'fun stop(timeoutMs: Long) = pool.awaitTermination(timeoutMs, TimeUnit.SECONDS)',
    ],
    [
      'TimeUnit.SECONDS.toMillis of millis',
      'fun ms(timeoutMs: Long) = TimeUnit.SECONDS.toMillis(timeoutMs)',
    ],
    [
      'a named argument of another unit',
      'fun open(ttlSeconds: Long) = connect(timeoutMs = ttlSeconds)',
    ],
    ['delay with seconds', 'suspend fun pause(retrySeconds: Long) { delay(retrySeconds) }'],
    [
      'a local val keeps the unit of its clock',
      'fun stale(limitSeconds: Long): Boolean {\n        val now = System.currentTimeMillis()\n        return now > limitSeconds\n    }',
    ],
  ])('flags %s', (_name, line) => {
    expect(found([line])).not.toEqual([]);
  });

  it.each([
    [
      'converted seconds',
      'fun at(ttlSeconds: Long) = System.currentTimeMillis() + ttlSeconds * 1000',
    ],
    [
      'TimeUnit conversion',
      'fun at(ttlSeconds: Long) = System.currentTimeMillis() + TimeUnit.SECONDS.toMillis(ttlSeconds)',
    ],
    [
      'the same unit',
      'fun left(timeoutMs: Long, startedMs: Long) = timeoutMs - (System.currentTimeMillis() - startedMs)',
    ],
    [
      'seconds into Duration.ofSeconds',
      'fun ttl(ttlSeconds: Long) = Duration.ofSeconds(ttlSeconds)',
    ],
    [
      'a matching TimeUnit',
      'fun stop(timeoutMs: Long) = pool.awaitTermination(timeoutMs, TimeUnit.MILLISECONDS)',
    ],
    [
      'a millis field from millis',
      'fun lock(text: String) { lockWaitTimeoutMillis = parseDuration(text).toMillis() }',
    ],
    ['words that only end like a unit', 'fun count(items: Int, atoms: Int) = items + atoms'],
    [
      'flags named with a unit',
      'fun differ(showSeconds: Boolean, showMs: Boolean) = showSeconds != showMs',
    ],
    ['unit text in a string', 'val hint = "timeoutMs = ttlSeconds"'],
    ['a named constant factor', 'fun ms(ttlSeconds: Long) = ttlSeconds * MILLIS_PER_SECOND'],
    ['division by a whole second', 'val nowSeconds = System.currentTimeMillis() / 1000'],
    [
      'chained on a new line',
      'fun ms(ttlSeconds: Long) = Duration\n        .ofSeconds(ttlSeconds)\n        .toMillis()',
    ],
  ])('passes %s', (_name, line) => {
    expect(found([line])).toEqual([]);
  });

  it('checks kotlin.time units only where the extension is imported', () => {
    const line = 'fun ttl(ttlMs: Long) = ttlMs.seconds';
    expect(found([line], ['import kotlin.time.Duration.Companion.seconds'])).toEqual([1]);
    expect(found([line])).toEqual([]);
    expect(
      found(
        ['fun ttl(ttlMs: Long) = ttlMs.milliseconds'],
        ['import kotlin.time.Duration.Companion.*'],
      ),
    ).toEqual([]);
  });

  it('flags epoch times cut to an Int and leaves durations alone', () => {
    expect(found(['val stamp = (System.currentTimeMillis() / 1000).toInt()'])).toEqual([1]);
    expect(found(['val stamp = Math.toIntExact(Instant.now().epochSecond)'])).toEqual([1]);
    expect(found(['val stamp = Date().time.toInt()'])).toEqual([1]);
    expect(found(['fun late(ttlSeconds: Long) = Date().getTime() > ttlSeconds'])).toEqual([1]);
    expect(
      found(['fun elapsed(startedMs: Long) = (System.currentTimeMillis() - startedMs).toInt()']),
    ).toEqual([]);
  });

  it('names both units, the factor and the conversion', () => {
    expect(
      messages(['fun deadline(ttlSeconds: Long) = System.currentTimeMillis() + ttlSeconds']),
    ).toEqual([
      '`System.currentTimeMillis()` is in milliseconds and `ttlSeconds` is in seconds, so the result is off by 1000x. Bring both sides to one unit first: convert the value once where it enters (`ttlSeconds * 1000`), and name the result with its unit.',
    ]);
  });

  it('scans deeply nested and generated expressions without running out of stack', () => {
    const depth = 5000;
    const nested = `${'f('.repeat(depth)}timeoutMs${')'.repeat(depth)}`;
    expect(found([`fun deep(timeoutMs: Long) = ${nested}`])).toEqual([]);
    expect(
      found([`fun deep(timeoutMs: Long) = ${'('.repeat(depth)}1${')'.repeat(depth)}`]),
    ).toEqual([]);
  });
});
