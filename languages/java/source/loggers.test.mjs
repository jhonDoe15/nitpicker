import { describe, expect, it } from 'vitest';
import { isFailureCall, logCalls, loggerNames, topLevelArguments } from './loggers.mjs';

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
  it('finds calls on declared loggers and on names ending in log or logger', () => {
    const code = [
      'val journal = LoggerFactory.getLogger(Foo::class.java)',
      'journal.warn("slow", e)',
      'LOGGER.info("done")',
      'logger.error(e) { "failed" }',
      'logger?.warn("maybe")',
      'logger.atError { cause = e }',
      'Log.e(TAG, "android", e)',
      'auditLog.debug("x")',
      'service.error("not a logger", e)',
      'journal.size()',
    ].join('\n');

    expect(logCalls(code).map(({ receiver, level, args }) => ({ receiver, level, args }))).toEqual([
      { receiver: 'journal', level: 'warn', args: ['"slow"', 'e'] },
      { receiver: 'LOGGER', level: 'info', args: ['"done"'] },
      { receiver: 'logger', level: 'error', args: ['e'] },
      { receiver: 'logger', level: 'warn', args: ['"maybe"'] },
      { receiver: 'logger', level: 'atError', args: [] },
      { receiver: 'Log', level: 'e', args: ['TAG', '"android"', 'e'] },
      { receiver: 'auditLog', level: 'debug', args: ['"x"'] },
    ]);
  });

  it('accepts log, logger and names ending at a camelCase or underscore boundary only', () => {
    const code = [
      'dialog.error("x", e)',
      'catalog.warn("x", e)',
      'backlog.error("x", e)',
      'changelog.error("x", e)',
      'log.error("a")',
      'Logger.warn("b")',
      'LOG.error("c")',
      'appLogger.error("d")',
      'AUDIT_LOG.error("e")',
      'audit_log.warn("f")',
      'audit_logger.warn("g")',
    ].join('\n');

    expect(logCalls(code).map(({ receiver }) => receiver)).toEqual([
      'log',
      'Logger',
      'LOG',
      'appLogger',
      'AUDIT_LOG',
      'audit_log',
      'audit_logger',
    ]);
  });

  it('keeps the trailing lambda and the fluent chain in the text of the call', () => {
    const [lambda] = logCalls('logger.error(e) { "failed ${x}" }\nrun()');
    const [chain] = logCalls(
      'logger.atError().setCause(e).addKeyValue("a", f(b)).log("x");\nrun();',
    );

    expect(lambda.text).toBe('logger.error(e) { "failed ${x}" }');
    expect(chain.text).toBe('logger.atError().setCause(e).addKeyValue("a", f(b)).log("x")');
  });
});

describe('isFailureCall', () => {
  it.each([
    ['logger.warn("x")', true],
    ['logger.error("x")', true],
    ['logger.warning("x")', true],
    ['logger.severe("x")', true],
    ['logger.atWarn { }', true],
    ['Log.w(TAG, "x")', true],
    ['Log.e(TAG, "x")', true],
    ['logger.log(Level.SEVERE, "x")', true],
    ['logger.log(Level.WARNING, "x")', true],
    ['logger.log(Level.INFO, "x")', false],
    ['logger.debug("x")', false],
    ['logger.info("x")', false],
    ['logger.trace("x")', false],
    ['logger.fine("x")', false],
    ['Log.d(TAG, "x")', false],
  ])('%s is %s', (code, expected) => {
    expect(isFailureCall(logCalls(code)[0])).toBe(expected);
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
