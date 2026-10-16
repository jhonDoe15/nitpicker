import { describe, expect, it } from 'vitest';
import { logCalls, loggerNames, topLevelArguments } from './loggers.mjs';

describe('loggerNames', () => {
  it.each([
    ['SLF4J', 'private val log = LoggerFactory.getLogger(Foo::class.java)', ['log']],
    ['kotlin-logging', 'private val audit = KotlinLogging.logger {}', ['audit']],
    ['Log4j2', 'val out: Logger = LogManager.getLogger()', ['out']],
    ['JUL', 'val journal = java.util.logging.Logger.getLogger(Foo::class.java.name)', ['journal']],
    [
      'Java SLF4J',
      'private static final Logger journal = LoggerFactory.getLogger(Foo.class);',
      ['journal'],
    ],
    ['no logger', 'val value = compute(3)', []],
  ])('finds the %s declaration', (_library, code, names) => {
    expect([...loggerNames(code)]).toEqual(names);
  });
});

describe('logCalls', () => {
  it('finds calls on declared loggers and on conventional names, with their arguments', () => {
    const code = [
      'val journal = LoggerFactory.getLogger(Foo::class.java)',
      'journal.warn("slow", e)',
      'LOGGER.info("done")',
      'logger.error(e) { "failed" }',
      'logger.atError { cause = e }',
      'dialog.error("not a logger", e)',
      'journal.size()',
    ].join('\n');

    expect(logCalls(code).map(({ receiver, level, args }) => ({ receiver, level, args }))).toEqual([
      { receiver: 'journal', level: 'warn', args: ['"slow"', 'e'] },
      { receiver: 'LOGGER', level: 'info', args: ['"done"'] },
      { receiver: 'logger', level: 'error', args: ['e'] },
      { receiver: 'logger', level: 'atError', args: [] },
    ]);
  });

  it('keeps the trailing lambda in the text of the call', () => {
    const [call] = logCalls('logger.error(e) { "failed ${x}" }\nrun()');

    expect(call.text).toBe('logger.error(e) { "failed ${x}" }');
  });
});

describe('topLevelArguments', () => {
  it('splits on commas outside brackets and trims', () => {
    expect(topLevelArguments(' "a", f(b, c), listOf(d, e) , {x, y}')).toEqual([
      '"a"',
      'f(b, c)',
      'listOf(d, e)',
      '{x, y}',
    ]);
  });
});
