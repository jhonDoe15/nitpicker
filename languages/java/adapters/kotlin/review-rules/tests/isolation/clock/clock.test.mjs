import { describe, expect, it } from 'vitest';
import { rulesOf } from '../../../test-support/sources.mjs';
import { CLOCK_RULE } from '../isolation.mjs';

const reads = (text) => rulesOf(text, CLOCK_RULE);

const HEAD = `package demo.orders

import java.time.Clock
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.util.Date
import org.junit.jupiter.api.Test

`;

describe('Kotlin tests that read the real clock', () => {
  it('reports now() without a clock and the system clock factories', () => {
    const text = `${HEAD}class StampTest {
    @Test
    fun reads() {
        val a = Instant.now()
        val b = LocalDate.now(ZoneId.of("UTC"))
        val c = java.time.LocalDateTime.now()
        val d = System.currentTimeMillis()
        val e = Clock.systemUTC()
        val f = Clock.system(ZoneId.systemDefault())
        val g = InstantSource.system()
        val h = Date()
        val i = kotlinx.datetime.Clock.System.now()
        val j = OffsetTime.now(ZoneOffset.UTC)
        println("$a $b $c $d $e $f $g $h $i $j")
    }
}
`;

    expect(reads(text)).toEqual([
      'StampTest.reads@13',
      'StampTest.reads@14',
      'StampTest.reads@15',
      'StampTest.reads@16',
      'StampTest.reads@17',
      'StampTest.reads@18',
      'StampTest.reads@19',
      'StampTest.reads@20',
      'StampTest.reads@21',
      'StampTest.reads@22',
    ]);
  });

  it('allows a fixed clock, monotonic time and a Date that is not java.util', () => {
    const text = `${HEAD.replace('import java.util.Date', 'import java.sql.Date')}class FixedTest {
    private val clock = Clock.fixed(Instant.parse("2024-01-01T00:00:00Z"), ZoneId.of("UTC"))

    @Test
    fun fixed() {
        val a = Instant.now(clock)
        val b = LocalDate.now(fixedClock)
        val c = System.nanoTime()
        val d = TimeSource.Monotonic.markNow()
        val e = measureTime { work() }
        val f = Date()
        println("$a $b $c $d $e $f")
    }
}
`;

    expect(reads(text)).toEqual([]);
  });

  it('allows reads that only measure time', () => {
    const text = `${HEAD}class MeasureTest {
    @Test
    fun elapsed() {
        val start = System.currentTimeMillis()
        work()
        val took = System.currentTimeMillis() - start
        assertTrue(took < 100)
    }

    @Test
    fun deadline() {
        val deadline = Instant.now().plusSeconds(5)
        while (Instant.now().isBefore(deadline)) {
            if (done()) break
        }
        do {
            work()
        } while (Instant.now() < deadline)
    }

    @Test
    fun between() {
        val begin = Instant.now()
        work()
        val end = Instant.now()
        assertTrue(Duration.between(begin, end).toMillis() < 100)
        assertTrue(Instant.now().isAfter(begin))
        assertTrue(begin.compareTo(Instant.now()) <= 0)
        assertTrue(System.currentTimeMillis() > 5)
    }

    @Test
    fun plusDeadline() {
        val end = System.currentTimeMillis() + 1000
        while (System.currentTimeMillis() < end) {
            if (done()) break
        }
    }
}
`;

    expect(reads(text)).toEqual([]);
  });

  it('reports a local that is used for more than measuring', () => {
    const text = `${HEAD}class StartTest {
    @Test
    fun used() {
        val start = Instant.now()
        val order = service.create(start)
        val took = Instant.now() - start
        assertEquals(start, order.createdAt)
    }

    @Test
    fun mixed() {
        val now = LocalDate.now()
        assertEquals(now, service.today())
    }

    @Test
    fun unused() {
        val stamp = Instant.now()
    }
}
`;

    expect(reads(text)).toEqual(['StartTest.used@13', 'StartTest.mixed@21', 'StartTest.unused@27']);
  });

  it('skips a file that fakes the time statically', () => {
    const text = `${HEAD}import io.mockk.mockkStatic

class FakedTest {
    @Test
    fun faked() {
        mockkStatic(Instant::class)
        every { Instant.now() } returns Instant.EPOCH
        println(LocalDate.now())
    }
}
`;

    expect(reads(text)).toEqual([]);
    expect(reads(text.replace('Instant::class', 'Clock::class'))).toEqual([]);
    expect(reads(text.replace('mockkStatic(Instant::class)', 'mockkStatic(Foo::class)'))).toEqual([
      'FakedTest.faked@16',
      'FakedTest.faked@17',
    ]);
  });

  it('reports a subtraction of a constant and a between of a user method', () => {
    const text = `${HEAD}class AgeTest {
    @Test
    fun constants() {
        val cutoff = System.currentTimeMillis() - 60_000
        val recent = Instant.now().toEpochMilli() - 1000
        val limit = System.currentTimeMillis() - TIMEOUT_MS
        val late = Instant.now() - Duration.ofMinutes(5)
        println("$cutoff $recent $limit $late")
    }

    @Test
    fun users() {
        assertTrue(schedule.between(Instant.now(), other))
        assertTrue(Duration.between(Instant.now(), other).isZero)
        assertTrue(Instant.now().toEpochMilli() - then.toEpochMilli() > 1)
    }
}
`;

    expect(reads(text)).toEqual([
      'AgeTest.constants@13',
      'AgeTest.constants@14',
      'AgeTest.constants@15',
      'AgeTest.constants@16',
      'AgeTest.users@22',
    ]);
  });
});
