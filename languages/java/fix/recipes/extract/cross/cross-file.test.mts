import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RecipeSource } from '../../../../../../core/fix/typed/fix-types.mts';
import { fieldOf, listOf } from '../../../../../../shared/values/readers.mts';
import { javaExtractNearDuplicateRecipe as recipe } from '../near-duplicate-extract.mts';
import { BASE, appliedFiles, filesOf } from '../test-support/cross-sources.mts';
import { compileFilesStatus, javacAvailable } from '../test-support/javac.mts';

const FOLDER = 'src/main/java/demo';

function plan(files: readonly RecipeSource[], root = '/nonexistent') {
  const { fixes, notes = [] } = recipe.plan({ files, projectRoot: root });
  return { fixes, notes, after: appliedFiles(files, fixes) };
}

function compiles(after: Record<string, string>) {
  const result = compileFilesStatus({ 'Adapter.java': BASE, ...after });
  return [result.status, result.stderr.replace(/Picked up.*\n/u, '')];
}

describe('javaExtractNearDuplicateRecipe across two files of one package', () => {
  it('is a project recipe that may write the new class', () => {
    expect([
      recipe.scope,
      recipe.accepts?.(`${FOLDER}/SqlTypes.java`),
      recipe.accepts?.('a.txt'),
    ]).toEqual(['project', true, false]);
  });

  it('extracts the copies into a new package-private class', () => {
    const { fixes, notes, after } = plan(filesOf());
    expect([fixes.length, notes]).toEqual([1, []]);
    expect(Object.keys(after).toSorted()).toMatchInlineSnapshot(`
      [
        "src/main/java/demo/Adapter.java",
        "src/main/java/demo/SqlAdapters.java",
        "src/main/java/demo/SqlDateAdapter.java",
        "src/main/java/demo/SqlTimeAdapter.java",
      ]
    `);
    expect(after[`${FOLDER}/SqlAdapters.java`]).toMatchInlineSnapshot(`
      "package demo;

      import java.text.DateFormat;
      import java.text.ParseException;
      import java.util.Date;
      import java.util.TimeZone;

      @SuppressWarnings("JavaUtilDate")
      final class SqlAdapters {
          private SqlAdapters() {}

          static <T, E extends Exception> T sharedRead(
                  String in,
                  Object lock,
                  DateFormat format,
                  String value,
                  LongCreator<T, E> creator) throws E {
              if (in.isEmpty()) {
                  return null;
              }
              String s = in.trim();
              synchronized (lock) {
                  TimeZone zone = format.getTimeZone(); // Save the original time zone
                  try {
                      Date parsed = format.parse(s);
                      return creator.create(parsed.getTime());
                  } catch (ParseException e) {
                      throw new IllegalArgumentException("Failed parsing '" + s + value + in.length(), e);
                  } finally {
                      format.setTimeZone(zone); // Restore the original time zone after parsing
                  }
              }
          }

          interface LongCreator<T, E extends Exception> {
              T create(long argument0) throws E;
          }
      }
      "
    `);
    expect(after[`${FOLDER}/SqlDateAdapter.java`]).toMatchInlineSnapshot(`
      "package demo;

      import java.sql.Date;
      import java.text.DateFormat;
      import java.text.SimpleDateFormat;

      @SuppressWarnings("JavaUtilDate")
      final class SqlDateAdapter extends Adapter<Date> {
          private final DateFormat format = new SimpleDateFormat("MMM d, yyyy");

          @Override
          public Date read(String in) {
              return SqlAdapters.sharedRead(in, this, format, "' as SQL Date; at ", Date::new);
          }
      }
      "
    `);
    expect(after[`${FOLDER}/SqlTimeAdapter.java`]).toMatchInlineSnapshot(`
      "package demo;

      import java.sql.Time;
      import java.text.DateFormat;
      import java.text.SimpleDateFormat;

      @SuppressWarnings("JavaUtilDate")
      final class SqlTimeAdapter extends Adapter<Time> {
          private final DateFormat format = new SimpleDateFormat("hh:mm:ss a");

          @Override
          public Time read(String in) {
              // Restore the original time zone
              return SqlAdapters.sharedRead(in, this, format, "' as SQL Time; at ", Time::new);
          }
      }
      "
    `);
  });

  it.runIf(javacAvailable())('produces code that compiles', () => {
    expect(compiles(plan(filesOf()).after)).toEqual([0, '']);
  });

  it('puts several shared methods of the two files into the same class', () => {
    const { fixes, notes, after } = plan(filesOf({ label: true }, { label: true }));
    expect([fixes.length, notes]).toEqual([1, []]);
    expect(listOf(fieldOf(fixes[0], 'alsoFixes')).length).toBe(1);
    expect(fixes[0]?.edits.filter(({ type }) => type === 'write').length).toBe(1);
    expect(after[`${FOLDER}/SqlAdapters.java`]).toMatchInlineSnapshot(`
      "package demo;

      import java.text.DateFormat;
      import java.text.ParseException;
      import java.util.Date;
      import java.util.TimeZone;

      @SuppressWarnings("JavaUtilDate")
      final class SqlAdapters {
          private SqlAdapters() {}

          static String sharedLabel(String in, String value) {
              StringBuilder out = new StringBuilder();
              for (int index = 0; index < in.length(); index++) {
                  out.append(in.charAt(index)).append(',');
              }
              out.append(value);
              if (out.length() > 100) {
                  out.setLength(100);
              }
              return out.toString();
          }

          static <T, E extends Exception> T sharedRead(
                  String in,
                  Object lock,
                  DateFormat format,
                  String value,
                  LongCreator<T, E> creator) throws E {
              if (in.isEmpty()) {
                  return null;
              }
              String s = in.trim();
              synchronized (lock) {
                  TimeZone zone = format.getTimeZone(); // Save the original time zone
                  try {
                      Date parsed = format.parse(s);
                      return creator.create(parsed.getTime());
                  } catch (ParseException e) {
                      throw new IllegalArgumentException("Failed parsing '" + s + value + in.length(), e);
                  } finally {
                      format.setTimeZone(zone); // Restore the original time zone after parsing
                  }
              }
          }

          interface LongCreator<T, E extends Exception> {
              T create(long argument0) throws E;
          }
      }
      "
    `);
  });

  it.runIf(javacAvailable())('produces compiling code for several shared methods', () => {
    expect(compiles(plan(filesOf({ label: true }, { label: true })).after)).toEqual([0, '']);
  });

  it('keeps the CRLF line endings of the files', () => {
    const files = filesOf().map(({ path: name, text }) => ({
      path: name,
      text: text.replaceAll('\n', '\r\n'),
    }));
    const text = plan(files).after[`${FOLDER}/SqlAdapters.java`];
    expect(text).toBeDefined();
    expect(text?.replaceAll('\r\n', '').includes('\n')).toBe(false);
  });
});

describe('javaExtractNearDuplicateRecipe leaves a shared class that is taken', () => {
  function inFolder(files: readonly RecipeSource[], existing: Record<string, string>) {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-cross-'));
    try {
      mkdirSync(path.join(root, FOLDER), { recursive: true });
      for (const [name, text] of Object.entries(existing)) {
        writeFileSync(path.join(root, FOLDER, name), text);
      }
      return plan(files, root);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  it('declines when the file already exists', () => {
    const found = inFolder(filesOf(), {
      'SqlAdapters.java': 'package demo;\nfinal class SqlAdapters {}\n',
    });
    expect([found.fixes.length, found.notes[0]?.split('near-duplicate: ').at(-1)]).toEqual([
      0,
      'a file named SqlAdapters already exists in the package',
    ]);
  });

  it('declines when another file of the package uses the name', () => {
    const found = inFolder(filesOf(), {
      'Other.java': 'package demo;\nclass Other { SqlAdapters x; }\n',
    });
    expect([found.fixes.length, found.notes[0]?.split('near-duplicate: ').at(-1)]).toEqual([
      0,
      'the name SqlAdapters is used in the package',
    ]);
  });
});
