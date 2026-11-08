import { describe, expect, it } from 'vitest';
import { lineOf, scanKotlinSource } from '../kotlin-source.mjs';
import { logFormatArguments } from './log-format-rules.mjs';

const JBOSS = 'import org.jboss.logging.Logger\n';
const JUL = 'import java.util.logging.Level\nimport java.util.logging.Logger\n';
const LOG4J = 'import org.apache.logging.log4j.Level\nimport org.apache.logging.log4j.LogManager\n';
const DECLARATIONS = [
  'private val log = Logger.getLogger(Shop::class.java)',
  'private val formatter = LogManager.getFormatterLogger(Shop::class.java)',
  'const val PREFIX = "cache %s: "',
].join('\n');

function found(header, body) {
  const source = `${header}\n${DECLARATIONS}\n\nfun calls(name: String, count: Int, ratio: Double, values: Array<Any>, error: Exception) {\n${body}\n}\n`;
  const scanned = scanKotlinSource(source);
  const first = lineOf(scanned, source.indexOf('fun calls'));
  return logFormatArguments(scanned).map(
    ({ rule, offset }) => `${String(lineOf(scanned, offset) - first)} ${rule}`,
  );
}

describe('logFormatArguments', () => {
  it.each([
    ['JBoss printf', JBOSS, 'log.infof("cache %s has %d entries", name, count)'],
    ['indexed and repeated', JBOSS, 'log.infof("cache %1\\$s has %2\\$d, %1\\$s", name, count)'],
    ['escapes and a relative index', JBOSS, 'log.infof("100%% of %s %<s%n", name)'],
    ['the exception first', JBOSS, 'log.errorf(error, "cache %s failed", name)'],
    ['a spread array', JBOSS, 'log.infof("cache %s %s", *values)'],
    ['a constant prefix', JBOSS, 'log.infof(PREFIX + "%d", name, count)'],
    ['a decimal', JBOSS, 'log.infof("ratio %.2f size %x", ratio, count)'],
    ['typed MessageFormat', JBOSS, 'log.infov("cache {0} has {1,number,#} entries", name, count)'],
    ['a doubled apostrophe', JBOSS, `log.infov("cache {0} isn''t ready", name)`],
    ['a quoted brace', JBOSS, `log.infov("cache '{'{0}'}'", name)`],
    ['logf with a level', JBOSS, 'log.logf(Logger.Level.WARN, "cache %s", name)'],
    ['logf with an exception', JBOSS, 'log.logf(Logger.Level.WARN, error, "cache %s", name)'],
    ['a trimmed raw string', JBOSS, 'log.infof("""\n    cache %s\n""".trimIndent(), name)'],
    ['a format from elsewhere', JBOSS, 'log.infof(Messages.FORMAT, name)'],
    ['JUL with one parameter', JUL, 'log.log(Level.INFO, "cache {0}", name)'],
    ['JUL with an array', JUL, 'log.log(Level.INFO, "cache {0} has {1}", arrayOf(name, count))'],
    ['JUL with an exception', JUL, 'log.log(Level.WARNING, "cache failed", error)'],
    ['JUL logp', JUL, 'log.logp(Level.INFO, "Shop", "calls", "cache {0}", name)'],
    ['Log4j printf', LOG4J, 'log.printf(Level.INFO, "cache %s has %d", name, count)'],
    ['a formatter logger', LOG4J, 'formatter.info("cache %s has %d", name, count)'],
    ['a trailing exception', LOG4J, 'formatter.error("cache %s failed", name, error)'],
    ['an exception overload', LOG4J, 'formatter.error("cache failed", error)'],
    ['a plain Log4j logger', LOG4J, 'log.info("cache {} has {}", name, count)'],
    ['a format with no logging import', '', 'log.infof("cache %s %s", name)'],
    ['a looked-up format', JBOSS, 'log.infof(bundle.getString("cache.miss"), name)'],
    ['a conditional format', JBOSS, 'log.infof(if (count > 0) "x %s" else "y %s", name)'],
    ['an exception that fills a placeholder', JBOSS, 'log.infof("%s: %s", name, null)'],
    ['a generic argument', JBOSS, 'log.infof("%s %s", name, mapOf<String, Int>())'],
    ['a JUL array from a call', JUL, 'log.log(Level.INFO, "{0} {1}", listOf(1, 2).toTypedArray())'],
    [
      'a name typed elsewhere',
      JBOSS,
      'val other = { name: String -> name }\n    val id = 42\n    log.infof("%d", id)',
    ],
    ['a percent sign with a width', JBOSS, 'log.infof("w %5% and %-5%")'],
    ['a marker named marker', LOG4J, 'log.printf(Level.INFO, marker, "a %s", name)'],
  ])('passes %s', (_, header, body) => {
    expect(found(header, body)).toEqual([]);
  });

  it.each([
    ['an argument with no placeholder', JBOSS, 'log.warnf("Entity ID is not an URI", name)'],
    ['placeholders with no argument', JBOSS, `log.warnf("Hardcoded group '%s' in mapper '%s'")`],
    ['a bare percent sign', JBOSS, `log.warnf("Remote cache '%' is down.", name)`],
    ['a template as the format', JBOSS, 'log.debugf("%s lock status: %b $name", count, ratio)'],
    ['a format joined with +', JBOSS, 'log.debugf("%s lock status: %b" + name, count, ratio)'],
    ['printf syntax in a MessageFormat method', JBOSS, 'log.debugv("cache %s", name)'],
    ['MessageFormat syntax in a printf method', JBOSS, 'log.infof("cache {0}", name)'],
    ['%d with a string', JBOSS, 'log.infof("cache %d", name)'],
    ['%d with a string literal', JBOSS, 'log.infof("cache %d", "main")'],
    ['%d with a decimal', JBOSS, 'log.infof("ratio %d", ratio)'],
    ['%f with an integer', JBOSS, 'log.infof("count %f", count)'],
    ['%d with a char', JBOSS, 'log.infof("code %d", \'c\')'],
    ['spaces inside a MessageFormat placeholder', JBOSS, 'log.infov("cache { 0 }", name)'],
    ['a logger reached through this', JBOSS, 'this.log.infof("cache %s %s", name)'],
    [
      'a marker named marker with too few arguments',
      LOG4J,
      'log.printf(Level.INFO, marker, "a %s %s", name)',
    ],
    ['a formatter logger with too many arguments', LOG4J, 'formatter.info("cache %s", name, name)'],
    ['a missing indexed argument', JBOSS, 'log.infof("cache %2\\$s", name)'],
    ['an apostrophe that quotes the placeholder', JBOSS, `log.infov("Can't load {0}", name)`],
    ['an empty brace pair', JBOSS, 'log.infov("cache {}", name)'],
    ['a constant with too few arguments', JBOSS, 'log.infof(PREFIX, name, count)'],
    [
      'logf with an exception and too few arguments',
      JBOSS,
      'log.logf(Logger.Level.WARN, error, "%s %s", name)',
    ],
    ['JUL with no placeholder', JUL, 'log.log(Level.INFO, "Loaded config", name)'],
    ['JUL with too few parameters', JUL, 'log.log(Level.INFO, "cache {0} has {1}", name)'],
    [
      'JUL with an exception and a placeholder',
      JUL,
      'log.log(Level.WARNING, "cache {0} failed", error)',
    ],
    ['JUL with printf syntax', JUL, 'log.log(Level.INFO, "cache %s", name)'],
    [
      'JUL logp with too few parameters',
      JUL,
      'log.logp(Level.INFO, "Shop", "calls", "{0} {1}", name)',
    ],
    ['Log4j printf with SLF4J syntax', LOG4J, 'log.printf(Level.INFO, "cache {}", name)'],
    ['Log4j printf with too few arguments', LOG4J, 'log.printf(Level.INFO, "cache %s %s", name)'],
    [
      'a formatter logger with SLF4J syntax',
      LOG4J,
      'formatter.info("cache {} has {}", name, count)',
    ],
    [
      'a formatter logger given only an exception',
      LOG4J,
      'formatter.error("cache %s failed", error)',
    ],
    ['a formatter logger debug template', LOG4J, 'formatter.debug("cache $name %s", count)'],
  ])('reports %s', (_, header, body) => {
    expect(found(header, body)).toEqual(['1 LogFormatArguments']);
  });

  it.each([
    [
      'an exception after the format',
      'log.errorf("Error decoding %s", name, error)',
      ['1 LogExceptionFirst'],
    ],
    [
      'an exception after a MessageFormat',
      'log.errorv("Error decoding {0}", name, error)',
      ['1 LogExceptionFirst'],
    ],
    [
      'an exception that fills the last placeholder',
      'log.errorf("%s: %s", name, error)',
      ['1 LogExceptionFirst'],
    ],
    [
      'a new exception after the format',
      'log.errorf("cache %s", name, IllegalStateException("x"))',
      ['1 LogExceptionFirst'],
    ],
    [
      'an exception after the format and a missing argument',
      'log.errorf("Error decoding %s %s %s", name, error)',
      ['1 LogFormatArguments', '1 LogExceptionFirst'],
    ],
  ])('reports %s for JBoss Logging', (_, body, expected) => {
    expect(found(JBOSS, body)).toEqual(expected);
  });

  it('leaves message templates to LogStringConcatenation on the plain level methods', () => {
    expect(found(LOG4J, 'formatter.info("cache $name %s", count)')).toEqual([]);
  });

  it('reads Quarkus Log calls', () => {
    expect(found('import io.quarkus.logging.Log\n', 'Log.infof("cache %s %s", name)')).toEqual([
      '1 LogFormatArguments',
    ]);
  });
});
