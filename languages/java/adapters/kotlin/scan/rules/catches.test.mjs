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
    [
      'a member of a public class',
      'class Renderer(private val tag: String) {\n    fun render(text: String, bold: Boolean): String {\n        if (bold) return text\n        return tag\n    }\n}\n',
    ],
    [
      'a member of a public class inside a public object',
      'object Holder {\n    class Renderer {\n        fun render(bold: Boolean): String {\n            if (bold) return "b"\n            return ""\n        }\n    }\n}\n',
    ],
    [
      'a flag behind package and import lines holding "internal"',
      'package com.acme.internal\n\nimport com.acme.internal.Api\n\nclass Renderer {\n    fun render(bold: Boolean): String {\n        if (bold) return "b"\n        return ""\n    }\n}\n',
    ],
    [
      'a public class after a private constant and a private function',
      'private const val TAG = "x"\n\nprivate fun helper() = 1\n\nclass Renderer {\n    fun render(bold: Boolean): String {\n        if (bold) return "b"\n        return ""\n    }\n}\n',
    ],
    [
      'a public class after an annotation line',
      '@Service\nclass Renderer {\n    fun render(bold: Boolean): String {\n        if (bold) return "b"\n        return ""\n    }\n}\n',
    ],
    [
      'a public function after a private function that returns an object',
      'private fun x() = object {\n    val a = 1\n}\n\nfun render(bold: Boolean): String {\n    if (bold) return "b"\n    return ""\n}\n',
    ],
    [
      'a companion object of a public class',
      'class Renderer {\n    companion object {\n        fun render(bold: Boolean): String {\n            if (bold) return "b"\n            return ""\n        }\n    }\n}\n',
    ],
    [
      'a subject-less when',
      'fun render(bold: Boolean): String = when {\n    bold -> "b"\n    else -> ""\n}\n',
    ],
    [
      'a while on the flag',
      'fun poll(running: Boolean) {\n    while (running) {\n        tick()\n    }\n}\n',
    ],
    [
      'a comparison with a boolean literal',
      'fun render(bold: Boolean): String {\n    if (bold == true) return "b"\n    return ""\n}\n',
    ],
    [
      'a use inside a nested lambda',
      'fun render(items: List<String>, bold: Boolean): List<String> {\n    return items.map { if (bold) it.uppercase() else it }\n}\n',
    ],
  ])('flags %s', (_name, source) => {
    expect(found(booleanFlags, source).map(([rule]) => rule)).toEqual(['BooleanFlagParameter']);
  });

  it.each([
    [
      'a nullable Boolean, which is a tri-state rather than a flag',
      'fun render(text: String, bold: Boolean?): String = when (bold) {\n    true -> "<b>$text</b>"\n    else -> text\n}\n',
    ],
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
      'a flag passed on, not branched on',
      'fun render(text: String, bold: Boolean): Span = Span(text, bold)\n',
    ],
    [
      'a function of an internal class',
      'internal class Renderer {\n    fun render(text: String, bold: Boolean): String {\n        if (bold) return text\n        return text\n    }\n}\n',
    ],
    [
      'a function of a private class',
      'private class Renderer(val tag: String) {\n    fun render(text: String, bold: Boolean): String {\n        if (bold) return text\n        return text\n    }\n}\n',
    ],
    [
      'a function of a class inside a private object',
      'private object Holder {\n    class Renderer {\n        fun render(bold: Boolean): String {\n            if (bold) return "b"\n            return ""\n        }\n    }\n}\n',
    ],
    [
      'a local function',
      'fun outer(text: String): String {\n    fun inner(bold: Boolean): String {\n        if (bold) return text\n        return text\n    }\n    return inner(true)\n}\n',
    ],
    [
      'a flag compared, not used as the condition',
      'fun same(a: Boolean, b: Boolean): Int {\n    if (a == b) return 1\n    return 0\n}\n',
    ],
    [
      'a function of an anonymous object',
      'fun make() = object {\n    fun render(bold: Boolean): String {\n        if (bold) return "b"\n        return ""\n    }\n}\n',
    ],
    [
      'a function of a private object after a public class',
      'class Api\n\nprivate object Holder {\n    fun render(bold: Boolean): String {\n        if (bold) return "b"\n        return ""\n    }\n}\n',
    ],
    [
      'a loop variable that shadows the flag',
      'fun render(bold: Boolean, items: List<Boolean>) {\n    for (bold in items) {\n        if (bold) tick()\n    }\n}\n',
    ],
    [
      'a lambda parameter that shadows the flag',
      'fun render(bold: Boolean, items: List<Boolean>) = items.filter { bold -> if (bold) true else false }\n',
    ],
    [
      'a local value that shadows the flag',
      'fun render(bold: Boolean): String {\n    val bold = compute()\n    if (bold) return "b"\n    return ""\n}\n',
    ],
  ])('passes %s', (_name, source) => {
    expect(found(booleanFlags, source)).toEqual([]);
  });
});
