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
  ])('allows %s', (_name, statement) => {
    expect(kotlin(inCatch(statement))).toEqual([]);
  });

  it.each([
    ['the message only', 'log.error(e.message)', 'error'],
    ['a string template of the exception', 'log.warn("failed: $e")', 'warn'],
    ['the message next to a text', 'log.error("failed: " + e.message)', 'error'],
    ['a lambda message without the exception', 'log.error { "failed ${e.message}" }', 'error'],
    ['the cause instead of the exception', 'log.error("failed", e.cause)', 'error'],
    ['a fixed text', 'log.info("falling back")', 'info'],
  ])('flags %s', (_name, statement, level) => {
    expect(kotlin(inCatch(statement))).toEqual([{ receiver: 'log', level, caught: 'e' }]);
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
});
