import { describe, expect, it } from 'vitest';
import { namesOf } from '../../test-support/check-runner.mts';
import { WALL_CLOCK_CHECK } from './wall-clock.mjs';

const names = namesOf(WALL_CLOCK_CHECK);

describe('WallClockElapsed in Java', () => {
  it('reports a timeout measured with currentTimeMillis', () => {
    expect(
      names(
        [
          'void wait(long timeout) {',
          '  long start = System.currentTimeMillis();',
          '  while (!done()) {',
          '    if (System.currentTimeMillis() - start > timeout) { throw new IllegalStateException(); }',
          '  }',
          '}',
        ].join('\n'),
      ),
    ).toEqual(['start']);
  });

  it('reports Duration.between of two Instant reads recorded as a metric', () => {
    expect(
      names(
        [
          'void run() {',
          '  Instant start = clock.instant();',
          '  work();',
          '  metric.record(Duration.between(start, clock.instant()));',
          '}',
        ].join('\n'),
      ),
    ).toEqual(['start']);
  });

  it('reports a difference kept in a local that is compared', () => {
    expect(
      names(
        [
          'void run(long limit) {',
          '  long start = System.currentTimeMillis();',
          '  work();',
          '  long elapsed = System.currentTimeMillis() - start;',
          '  if (elapsed > limit) { warn(); }',
          '}',
        ].join('\n'),
      ),
    ).toEqual(['start']);
  });

  it('leaves the monotonic clock, stored times and unused differences', () => {
    expect(
      names(
        [
          'void a(long timeout) { long start = System.nanoTime(); if ' +
            '(System.nanoTime() - start > timeout) { fail(); } }',
          'void b(long timeout) { long start = System.currentTimeMillis(); ' +
            'save(start); if (System.currentTimeMillis() - start > timeout) { fail(); ' +
            '} }',
          'void c() { long start = System.currentTimeMillis(); work(); ' +
            'log.info("took {}", System.currentTimeMillis() - start); }',
          'boolean d(Order order, long limit) { return System.currentTimeMillis() - order.createdAt() > limit; }',
        ].join('\n'),
      ),
    ).toEqual([]);
  });
});

describe('WallClockElapsed in Kotlin', () => {
  it('reports a deadline loop on Instant.now', () => {
    expect(
      names(
        [
          'fun spin(limit: Long) {',
          '  val start = System.currentTimeMillis()',
          '  while (System.currentTimeMillis() - start < limit) { work() }',
          '}',
        ].join('\n'),
        { kotlin: true },
      ),
    ).toEqual(['start']);
  });
});
