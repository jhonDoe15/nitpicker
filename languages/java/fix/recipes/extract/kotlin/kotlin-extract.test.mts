import { describe, expect, it } from 'vitest';
import { javaExtractNearDuplicateRecipe as recipe } from '../near-duplicate-extract.mts';
import { PATH, classOf, copy, planned, topLevel } from './test-support/kotlin-sources.mts';

const PAIR = [copy('top'), copy('bottom', { prefix: 'bottom:' })];

describe('javaExtractNearDuplicateRecipe for Kotlin', () => {
  it('accepts Kotlin sources', () => {
    expect([
      recipe.accepts?.('src/main/kotlin/demo/Align.kt'),
      recipe.accepts?.('notes.txt'),
    ]).toEqual([true, false]);
  });

  it('extracts a private member function after the first copy', () => {
    const result = planned(recipe, classOf(...PAIR));
    expect(result.fixes.map(({ finding }) => finding)).toEqual([
      { tool: 'structure', rule: 'near-duplicate', path: PATH, line: 4 },
    ]);
    expect(result.after).toMatchInlineSnapshot(`
      "package demo

      class Align {
          fun top(selection: List<String>, limit: Int): String {
              return sharedTop(selection, limit, "top:")
          }

          private fun sharedTop(selection: List<String>, limit: Int, text: String): String {
              val selected = mutableListOf<String>()
              for (element in selection) {
                  if (element.length < limit) {
                      selected.add(element)
                  }
              }
              val label = selected.joinToString(",")
              return (if (label.length > 0) text else "none:") + label
          }

          fun bottom(selection: List<String>, limit: Int): String {
              return sharedTop(selection, limit, "bottom:")
          }
      }
      "
    `);
  });

  it('keeps a comment only the second copy has above its call', () => {
    const commented = copy('bottom', { prefix: 'bottom:' }).replace(
      'val label',
      '// keep the order\n        val label',
    );
    expect(planned(recipe, classOf(copy('top'), commented)).after).toMatchInlineSnapshot(`
      "package demo

      class Align {
          fun top(selection: List<String>, limit: Int): String {
              return sharedTop(selection, limit, "top:")
          }

          private fun sharedTop(selection: List<String>, limit: Int, text: String): String {
              val selected = mutableListOf<String>()
              for (element in selection) {
                  if (element.length < limit) {
                      selected.add(element)
                  }
              }
              val label = selected.joinToString(",")
              return (if (label.length > 0) text else "none:") + label
          }

          fun bottom(selection: List<String>, limit: Int): String {
              // keep the order
              return sharedTop(selection, limit, "bottom:")
          }
      }
      "
    `);
  });

  it('keeps the line endings of a file that uses CRLF', () => {
    const { fixes, after } = planned(recipe, classOf(...PAIR).replaceAll('\n', '\r\n'));
    expect([fixes.length, after.replaceAll('\r\n', '').includes('\n')]).toEqual([1, false]);
  });

  it('extracts a private top-level function from top-level copies', () => {
    expect(planned(recipe, topLevel(...PAIR)).after).toMatchInlineSnapshot(`
      "package demo

      fun top(selection: List<String>, limit: Int): String {
          return sharedTop(selection, limit, "top:")
      }

      private fun sharedTop(selection: List<String>, limit: Int, text: String): String {
          val selected = mutableListOf<String>()
          for (element in selection) {
              if (element.length < limit) {
                  selected.add(element)
              }
          }
          val label = selected.joinToString(",")
          return (if (label.length > 0) text else "none:") + label
      }

      fun bottom(selection: List<String>, limit: Int): String {
          return sharedTop(selection, limit, "bottom:")
      }
      "
    `);
  });

  it('keeps suspend on the shared function', () => {
    const suspending = PAIR.map((text) => text.replace('    fun', '    suspend fun'));
    expect(planned(recipe, classOf(...suspending)).after).toMatchInlineSnapshot(`
      "package demo

      class Align {
          suspend fun top(selection: List<String>, limit: Int): String {
              return sharedTop(selection, limit, "top:")
          }

          private suspend fun sharedTop(selection: List<String>, limit: Int, text: String): String {
              val selected = mutableListOf<String>()
              for (element in selection) {
                  if (element.length < limit) {
                      selected.add(element)
                  }
              }
              val label = selected.joinToString(",")
              return (if (label.length > 0) text else "none:") + label
          }

          suspend fun bottom(selection: List<String>, limit: Int): String {
              return sharedTop(selection, limit, "bottom:")
          }
      }
      "
    `);
  });

  it('shares a function with an expression body that declares its return type', () => {
    const one = (
      name: string,
      word: string,
    ) => `    fun ${name}(items: List<String>, limit: Int): String =
        items.filter { it.isNotEmpty() && it.length < limit }
            .map { it.trim().lowercase() + "${word}" }
            .sortedBy { it.length }
            .distinct()
            .joinToString(",")
`;
    const source = classOf(one('first', '-a'), one('second', '-b'));
    expect(planned(recipe, source).after).toMatchInlineSnapshot(`
      "package demo

      class Align {
          fun first(items: List<String>, limit: Int): String = sharedFirst(items, limit, "-a")

          private fun sharedFirst(items: List<String>, limit: Int, text: String): String =
              items.filter { it.isNotEmpty() && it.length < limit }
                  .map { it.trim().lowercase() + text }
                  .sortedBy { it.length }
                  .distinct()
                  .joinToString(",")

          fun second(items: List<String>, limit: Int): String = sharedFirst(items, limit, "-b")
      }
      "
    `);
  });

  it('passes a number the copies assign to a local as a parameter', () => {
    const stepped = (text: string, step: string) =>
      text
        .replace('val selected', `val step: Int = ${step}\n        val selected`)
        .replace('< limit', '< limit + step');
    const source = classOf(stepped(PAIR[0] ?? '', '1'), stepped(PAIR[1] ?? '', '2'));
    expect(planned(recipe, source).after).toMatchInlineSnapshot(`
      "package demo

      class Align {
          fun top(selection: List<String>, limit: Int): String {
              return sharedTop(selection, limit, 1, "top:")
          }

          private fun sharedTop(selection: List<String>, limit: Int, number: Int, text: String): String {
              val step: Int = number
              val selected = mutableListOf<String>()
              for (element in selection) {
                  if (element.length < limit + step) {
                      selected.add(element)
                  }
              }
              val label = selected.joinToString(",")
              return (if (label.length > 0) text else "none:") + label
          }

          fun bottom(selection: List<String>, limit: Int): String {
              return sharedTop(selection, limit, 2, "bottom:")
          }
      }
      "
    `);
  });

  it('passes a number above the Int range as a Long parameter', () => {
    const timed = (text: string, limit: string) =>
      text.replace('val selected', `val timeout = ${limit}\n        val selected`);
    const source = classOf(
      timed(PAIR[0] ?? '', '3_000_000_000'),
      timed(PAIR[1] ?? '', '4000000000L'),
    );
    expect(planned(recipe, source).after).toMatchInlineSnapshot(`
      "package demo

      class Align {
          fun top(selection: List<String>, limit: Int): String {
              return sharedTop(selection, limit, 3_000_000_000, "top:")
          }

          private fun sharedTop(selection: List<String>, limit: Int, number: Long, text: String): String {
              val timeout = number
              val selected = mutableListOf<String>()
              for (element in selection) {
                  if (element.length < limit) {
                      selected.add(element)
                  }
              }
              val label = selected.joinToString(",")
              return (if (label.length > 0) text else "none:") + label
          }

          fun bottom(selection: List<String>, limit: Int): String {
              return sharedTop(selection, limit, 4000000000L, "bottom:")
          }
      }
      "
    `);
  });

  it('extracts a function that returns nothing as a statement call', () => {
    const quiet = (
      name: string,
      word: string,
    ) => `    fun ${name}(items: List<String>, limit: Int) {
        var shown = 0
        for (item in items) {
            if (item.isEmpty()) {
                println("${word}: empty")
            } else if (shown < limit) {
                println("${word}: " + item.trim())
                shown += 1
            }
        }
        println("${word}: " + shown + " of " + items.size)
    }
`;
    const source = classOf(quiet('first', 'one'), quiet('second', 'two'));
    expect(planned(recipe, source).after).toMatchInlineSnapshot(`
      "package demo

      class Align {
          fun first(items: List<String>, limit: Int) {
              sharedFirst(items, limit, "one: ", "one: empty")
          }

          private fun sharedFirst(items: List<String>, limit: Int, text: String, textValue: String) {
              var shown = 0
              for (item in items) {
                  if (item.isEmpty()) {
                      println(textValue)
                  } else if (shown < limit) {
                      println(text + item.trim())
                      shown += 1
                  }
              }
              println(text + shown + " of " + items.size)
          }

          fun second(items: List<String>, limit: Int) {
              sharedFirst(items, limit, "two: ", "two: empty")
          }
      }
      "
    `);
  });
});
