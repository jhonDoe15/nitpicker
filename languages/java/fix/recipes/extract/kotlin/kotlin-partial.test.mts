import { describe, expect, it } from 'vitest';
import { javaExtractPartialRunRecipe as recipe } from '../partial/partial-run-extract.mts';
import {
  PATH,
  headerClass,
  headerCopy,
  headerPair,
  planned,
} from './test-support/kotlin-sources.mts';
import { FIRST_NAMES, SECOND_NAMES } from './test-support/kotlin-sources.mts';

describe('javaExtractPartialRunRecipe for Kotlin', () => {
  it('extracts a shared header loop into a private function that returns the value used after it', () => {
    const result = planned(recipe, headerClass(...headerPair()));
    expect(result.fixes.map(({ finding }) => finding)).toEqual([
      { tool: 'structure', rule: 'near-duplicate', path: PATH, line: 6 },
    ]);
    expect(result.after).toMatchInlineSnapshot(`
      "package demo

      import java.util.TreeMap

      class Align {
          fun headerNames(raw: List<String>, limit: Int): String {
              val names: List<String> = sharedHeaderNamesSteps(raw, limit)
              return names.joinToString(",")
          }

          private fun sharedHeaderNamesSteps(raw: List<String>, limit: Int): List<String> {
              val headers: MutableMap<String, String> = TreeMap()
              for (line in raw) {
                  val index = line.indexOf(':')
                  if (index > 0 && headers.size < limit) {
                      headers[line.substring(0, index).trim().lowercase()] = line.substring(index + 1).trim()
                  }
              }
              val names: List<String> = headers.keys.toList()
              return names
          }

          fun headerCount(lines: List<String>, cap: Int): Int {
              val total = lines.size
              val keys: List<String> = sharedHeaderNamesSteps(lines, cap)
              return keys.size + total
          }
      }
      "
    `);
  });

  it('keeps the line endings of a file that uses CRLF', () => {
    const { fixes, after } = planned(recipe, headerClass(...headerPair()).replaceAll('\n', '\r\n'));
    expect([fixes.length, after.replaceAll('\r\n', '').includes('\n')]).toEqual([1, false]);
  });

  it('passes the value that differs between the runs', () => {
    const second = headerCopy('headerCount', SECOND_NAMES, {
      type: 'Int',
      before: 'val total = lines.size',
      after: '        return keys.size + total',
    }).replace("':'", "'='");
    const first = headerCopy('headerNames', FIRST_NAMES, {
      type: 'String',
      after: '        return names.joinToString(",")',
    });
    expect(planned(recipe, headerClass(first, second)).after).toMatchInlineSnapshot(`
      "package demo

      import java.util.TreeMap

      class Align {
          fun headerNames(raw: List<String>, limit: Int): String {
              val names: List<String> = sharedHeaderNamesSteps(raw, limit, ':')
              return names.joinToString(",")
          }

          private fun sharedHeaderNamesSteps(raw: List<String>, limit: Int, symbol: Char): List<String> {
              val headers: MutableMap<String, String> = TreeMap()
              for (line in raw) {
                  val index = line.indexOf(symbol)
                  if (index > 0 && headers.size < limit) {
                      headers[line.substring(0, index).trim().lowercase()] = line.substring(index + 1).trim()
                  }
              }
              val names: List<String> = headers.keys.toList()
              return names
          }

          fun headerCount(lines: List<String>, cap: Int): Int {
              val total = lines.size
              val keys: List<String> = sharedHeaderNamesSteps(lines, cap, '=')
              return keys.size + total
          }
      }
      "
    `);
  });
});
