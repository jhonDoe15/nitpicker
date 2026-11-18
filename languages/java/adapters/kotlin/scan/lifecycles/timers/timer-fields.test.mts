import { describe, expect, it } from 'vitest';
import { type Check, type Ruled, lineOf, scanKotlinSource } from '../../typed/typed-scan.mts';
import { timerNotStoppedOnClose as untypedTimerNotStoppedOnClose } from './timer-fields.mts';

const timerNotStoppedOnClose: Check<Ruled> = untypedTimerNotStoppedOnClose;

function lines(source: string) {
  const scanned = scanKotlinSource(source);
  return timerNotStoppedOnClose(scanned).map(({ offset }) => lineOf(scanned, offset));
}

const SCHEDULER = '    private val scheduler = Executors.newSingleThreadScheduledExecutor()';
const inClass = (closeBody: string, property = SCHEDULER, annotation = '') =>
  [
    `${annotation}class Poller : AutoCloseable {`,
    property,
    '    override fun close() {',
    ...closeBody.split('\n').map((line: string) => `        ${line}`),
    '    }',
    '}',
    '',
  ].join('\n');

describe('timerNotStoppedOnClose', () => {
  it.each([
    ['a close that does nothing', inClass('state = null')],
    ['another executor shut down', inClass('other.shutdown()')],
    ['a timer', inClass('state = null', '    private val timer = Timer(true)')],
    [
      'a fixed rate timer',
      inClass('state = null', '    private val ticker = fixedRateTimer("t", period = 5) {}'),
    ],
    [
      'a scheduled thread pool',
      inClass('state = null', '    val pool = Executors.newScheduledThreadPool(2)'),
    ],
    [
      'a lateinit scheduler assigned in start',
      inClass(
        'state = null',
        '    private lateinit var scheduler: ScheduledExecutorService',
      ).replace(
        '    override fun close',
        '    fun start() {\n        scheduler = Executors.newSingleThreadScheduledExecutor()\n    }\n    override fun close',
      ),
    ],
  ])('reports %s', (_name, source) => {
    expect(lines(source)).toEqual([2]);
  });

  it.each([
    ['shutdownNow', inClass('scheduler.shutdownNow()')],
    [
      'shutdown and await',
      inClass('scheduler.shutdown()\nscheduler.awaitTermination(1, TimeUnit.SECONDS)'),
    ],
    ['a timer cancel', inClass('timer.cancel()', '    private val timer = Timer(true)')],
    [
      'a helper',
      `${inClass('stopAll()').trimEnd().slice(0, -1)}    private fun stopAll() {\n        scheduler.shutdown()\n    }\n}\n`,
    ],
    [
      'a guava helper',
      inClass('MoreExecutors.shutdownAndAwaitTermination(scheduler, 1, TimeUnit.SECONDS)'),
    ],
    ['no close function', `class Poller {\n${SCHEDULER}\n}\n`],
    ['a spring bean', inClass('state = null', SCHEDULER, '@Component\n')],
    [
      'a plain executor',
      inClass('state = null', '    private val pool = Executors.newFixedThreadPool(2)'),
    ],
  ])('allows %s', (_name, source) => {
    expect(lines(source)).toEqual([]);
  });
});
