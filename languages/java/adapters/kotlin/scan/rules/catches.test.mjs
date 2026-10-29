import { describe, expect, it } from 'vitest';
import { lineOf, scanKotlinSource } from '../kotlin-source.mjs';
import { booleanFlags, catchOnlyLogs } from './catches.mjs';

function found(check, source) {
  const scanned = scanKotlinSource(source);
  return check(scanned).map((reported) => [reported.rule, lineOf(scanned, reported.offset)]);
}

function guarded(handler, { type = 'IOException', name = 'e' } = {}) {
  return `fun load(): String? {\n    try {\n        return read()\n    } catch (${name}: ${type}) {\n${handler.map((line) => `        ${line}`).join('\n')}\n    }\n    return null\n}\n`;
}

describe('catchOnlyLogs', () => {
  it.each([
    ['a log call without the exception', ['log.error("load failed")']],
    ['a log call with the exception', ['log.error("load failed", e)']],
    ['a log and a default', ['logger.warn("load failed: {}", e.message)', 'return ""']],
    ['a default alone', ['return null']],
    ['a stack trace print', ['e.printStackTrace()']],
    ['an ignored exception named _', ['log.info("skipped")'], { name: '_' }],
  ])('flags a catch with %s', (_name, handler, options) => {
    expect(found(catchOnlyLogs, guarded(handler, options))).toEqual([
      ['CatchOnlyLogsOrReturnsDefault', 4],
    ]);
  });

  it.each([
    ['a rethrow with the cause', ['throw LoadException("load failed", e)']],
    ['a rethrow after logging', ['log.error("load failed", e)', 'throw e']],
    ['a failure result', ['return Result.failure(e).toString()']],
    ['the exception passed on', ['failures.add(e)']],
    ['an error response', ['return ResponseEntity.status(500).build<String>().toString()']],
    ['an empty catch, which detekt reports', []],
    ['an interrupt', ['Thread.currentThread().interrupt()'], { type: 'InterruptedException' }],
  ])('passes a catch with %s', (_name, handler, options) => {
    expect(found(catchOnlyLogs, guarded(handler, options))).toEqual([]);
  });

  it('passes the catch of a retry loop', () => {
    const source =
      'fun load(): String {\n    repeat(3) {\n        try {\n            return read()\n        } catch (e: IOException) {\n            log.warn("retrying")\n        }\n    }\n    throw IllegalStateException("gave up")\n}\n';

    expect(found(catchOnlyLogs, source)).toEqual([]);
  });

  it('reads the catch parameter only in code, not in a log message or a comment', () => {
    const source = guarded(['log.error("e is broken: $e")', '// e', 'return null']);

    expect(found(catchOnlyLogs, source)).toEqual([['CatchOnlyLogsOrReturnsDefault', 4]]);
  });
});

describe('booleanFlags', () => {
  it.each([
    [
      'an if on the flag',
      'fun render(text: String, bold: Boolean): String {\n    if (bold) return "<b>$text</b>"\n    return text\n}\n',
    ],
    [
      'a negated flag in an expression body',
      'fun render(text: String, bold: Boolean) = if (!bold) text else "<b>$text</b>"\n',
    ],
    [
      'a when on the flag',
      'fun render(text: String, bold: Boolean): String = when (bold) {\n    true -> "<b>$text</b>"\n    else -> text\n}\n',
    ],
    [
      'a flag in a combined condition',
      'fun send(text: String, urgent: Boolean): String {\n    if (urgent && text.isNotEmpty()) return "!"\n    return text\n}\n',
    ],
  ])('flags %s', (_name, source) => {
    expect(found(booleanFlags, source).map(([rule]) => rule)).toEqual(['BooleanFlagParameter']);
  });

  it.each([
    [
      'a private function',
      'private fun render(text: String, bold: Boolean): String {\n    if (bold) return text\n    return text\n}\n',
    ],
    [
      'an override',
      'override fun render(text: String, bold: Boolean): String {\n    if (bold) return text\n    return text\n}\n',
    ],
    ['a setter', 'fun setEnabled(enabled: Boolean) {\n    if (enabled) start()\n}\n'],
    [
      'a builder',
      'fun withCache(cache: Boolean): Builder {\n    if (cache) start()\n    return this\n}\n',
    ],
    [
      'an annotated parameter',
      'fun render(@RequestParam bold: Boolean): String {\n    if (bold) return "b"\n    return ""\n}\n',
    ],
    [
      'a nullable flag, left to TriStateBoolean',
      'fun render(text: String, bold: Boolean?): String = when (bold) {\n    true -> "<b>$text</b>"\n    else -> text\n}\n',
    ],
    [
      'a flag passed on, not branched on',
      'fun render(text: String, bold: Boolean): Span = Span(text, bold)\n',
    ],
    [
      'a flag compared, not used as the condition',
      'fun same(a: Boolean, b: Boolean): Int {\n    if (a == b) return 1\n    return 0\n}\n',
    ],
  ])('passes %s', (_name, source) => {
    expect(found(booleanFlags, source)).toEqual([]);
  });
});
