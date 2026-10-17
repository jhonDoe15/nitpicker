import { describe, expect, it } from 'vitest';
import { catchLogViolations } from './catch-logging.mjs';
import { maskJavaSource } from './java-masking.mjs';
import { maskKotlinSource } from '../adapters/kotlin/rules/kotlin-literals.mjs';

const kotlin = (source) => catchLogViolations(maskKotlinSource(source).code, 'kotlin');
const java = (source) => catchLogViolations(maskJavaSource(source), 'java');
const inCatch = (statement, variable = 'e') =>
  `val log = LoggerFactory.getLogger(Foo::class.java)\nfun f() {\n  try {\n    run()\n  } catch (${variable}: Exception) {\n    ${statement}\n  }\n}\n`;

describe('catchLogViolations in Kotlin', () => {
  it.each([
    ['SLF4J message and exception', 'log.error("failed", e)'],
    ['kotlin-logging with the exception first', 'log.error(e) { "failed" }'],
    ['a named exception argument', 'log.error(throwable = e) { "failed" }'],
    ['kotlin-logging atError cause', 'log.atError { cause = e }'],
    ['JUL with level, message and exception', 'log.log(Level.SEVERE, "failed", e)'],
    ['a log with other arguments before the exception', 'log.warn("failed {} {}", id, e)'],
    ['no log call at all', 'rethrow(e)'],
    ['a cast of the exception', 'log.error("failed", e as Throwable)'],
    ['a safe cast of the exception', 'log.error("failed", e as? Throwable)'],
    ['the SLF4J 2 fluent API', 'log.atError().setCause(e).log("failed")'],
    ['the fluent API with other links first', 'log.atWarn().addKeyValue("a", 1).setCause(e).log()'],
    ['Log4j2 withThrowable', 'log.atError().withThrowable(e).log("failed")'],
    ['a safe call on the logger', 'logger?.error("failed", e)'],
    ['Android Log.e with the exception', 'Log.e(TAG, "failed", e)'],
    ['a message-only log followed by a rethrow', 'log.error("failed")\n    throw e'],
    [
      'a message-only log followed by a wrapped throw',
      'log.warn("failed")\n    throw IllegalStateException("x", e)',
    ],
    [
      'a wrapped throw over several lines',
      'log.warn("failed")\n    throw IllegalStateException(\n      "x",\n      e,\n    )',
    ],
    ['an info log', 'log.info("falling back")'],
    ['a debug log', 'log.debug("not a number: ${e.message}")'],
    ['a trace log', 'log.trace("skipped")'],
    ['an Android debug log', 'Log.d(TAG, "skipped")'],
    ['a JUL fine log', 'log.fine("skipped")'],
  ])('allows %s', (_name, statement) => {
    expect(kotlin(inCatch(statement))).toEqual([]);
  });

  it.each([
    ['the message only', 'log.error(e.message)', 'error'],
    ['a string template of the exception', 'log.warn("failed: $e")', 'warn'],
    ['the message next to a text', 'log.error("failed: " + e.message)', 'error'],
    ['a lambda message without the exception', 'log.error { "failed ${e.message}" }', 'error'],
    ['the cause instead of the exception', 'log.error("failed", e.cause)', 'error'],
    ['a fixed text', 'log.warn("falling back")', 'warn'],
    ['a fluent log without the exception', 'log.atError().log("failed")', 'atError'],
    [
      'a message with the exception text only on a safe call',
      'logger?.error(e.message)',
      'error',
      'logger',
    ],
    ['Android Log.w with the message only', 'Log.w(TAG, e.message)', 'w', 'Log'],
    [
      'a throw of an unrelated exception',
      'log.error("failed")\n    throw IllegalStateException("x")',
      'error',
    ],
    ['JUL severe through log', 'log.log(Level.SEVERE, "failed ${e.message}")', 'log'],
  ])('flags %s', (_name, statement, level, receiver = 'log') => {
    expect(kotlin(inCatch(statement))).toEqual([{ receiver, level, caught: 'e' }]);
  });

  it('ignores logging outside catch blocks and in catches of an ignored exception', () => {
    expect(kotlin('fun f() {\n  log.error("start")\n}\n')).toEqual([]);
    expect(kotlin(inCatch('log.debug("not a number")', 'ignored'))).toEqual([]);
  });

  it('checks a nested catch against its own exception', () => {
    const source = [
      'fun f() {',
      '  try { a() } catch (outer: Exception) {',
      '    try { b() } catch (inner: Exception) {',
      '      log.error("inner", outer)',
      '    }',
      '    log.error("outer", outer)',
      '  }',
      '}',
    ].join('\n');

    expect(kotlin(source)).toEqual([{ receiver: 'log', level: 'error', caught: 'inner' }]);
  });
});

describe('catchLogViolations in Java', () => {
  it('reads the Java catch syntax, including multi-catch and final', () => {
    const source = [
      'void f() {',
      '  try { run(); } catch (final IOException | RuntimeException e) {',
      '    LOG.error("failed: " + e.getMessage());',
      '  } catch (Exception other) {',
      '    LOG.error("failed", other);',
      '  }',
      '}',
    ].join('\n');

    expect(java(source)).toEqual([{ receiver: 'LOG', level: 'error', caught: 'e' }]);
  });

  const inJavaCatch = (statement) =>
    `class A {\n  void f() {\n    try { run(); } catch (Exception e) {\n      ${statement}\n    }\n  }\n}\n`;

  it.each([
    ['a cast of the exception', 'LOG.error("failed", (Throwable) e);'],
    ['the SLF4J 2 fluent API', 'LOG.atError().setCause(e).log("failed");'],
    ['a rethrow', 'LOG.error("failed");\n      throw e;'],
    ['a wrapped throw', 'LOG.warn("failed");\n      throw new IllegalStateException("x", e);'],
    ['an info log', 'LOG.info("failed " + e.getMessage());'],
    ['JUL fine', 'LOG.log(Level.FINE, "failed");'],
  ])('allows %s', (_name, statement) => {
    expect(java(inJavaCatch(statement))).toEqual([]);
  });

  it.each([
    ['LOG.error("failed: " + e.getMessage());', 'error'],
    ['LOG.warn("failed");', 'warn'],
    ['LOG.atError().log("failed");', 'atError'],
    ['LOG.severe("failed");', 'severe'],
  ])('flags %s', (statement, level) => {
    expect(java(inJavaCatch(statement))).toEqual([{ receiver: 'LOG', level, caught: 'e' }]);
  });
});
