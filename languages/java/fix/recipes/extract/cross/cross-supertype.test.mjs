import { describe, expect, it } from 'vitest';
import { javaExtractNearDuplicateRecipe as recipe } from '../near-duplicate-extract.mjs';
import { BASE, appliedFiles, filesOf } from '../test-support/cross-sources.mjs';
import { compileFilesStatus, javacAvailable } from '../test-support/javac.mjs';

const FOLDER = 'src/main/java/demo';
const COVER = 'the code uses a value of the differing type in a way a type parameter cannot cover';

function plan(files) {
  const { fixes, notes } = recipe.plan({ files, projectRoot: '/nonexistent' });
  return { fixes, notes, after: appliedFiles(files, fixes) };
}

function both(overrides) {
  return filesOf({ write: true, ...overrides }, { write: true, ...overrides });
}

describe('javaExtractNearDuplicateRecipe with a differing type that has a common supertype', () => {
  it('passes the value as java.util.Date when it is only checked and formatted', () => {
    const { fixes, after } = plan(both({}));
    expect(fixes.length).toBe(2);
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
                  String valueValue,
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
                      throw new IllegalArgumentException("Failed parsing '" + s + valueValue + in.length(), e);
                  } finally {
                      format.setTimeZone(zone); // Restore the original time zone after parsing
                  }
              }
          }

          static void sharedWrite(StringBuilder out, Date value, Object lock, DateFormat formatValue) {
              if (value == null) {
                  out.append("null");
                  return;
              }
              String text;
              synchronized (lock) {
                  text = formatValue.format(value);
              }
              out.append(text);
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

          public void write(StringBuilder out, Date value) {
              SqlAdapters.sharedWrite(out, value, this, format);
          }
      }
      "
    `);
  });

  it.runIf(javacAvailable())('produces code that compiles', () => {
    const result = compileFilesStatus({ 'Adapter.java': BASE, ...plan(both({})).after });
    expect([result.status, result.stderr.replace(/Picked up.*\n/u, '')]).toEqual([0, '']);
  });

  it.each([
    ['a method call on the value', both({ use: 'format.format(value) + value.getTime()' }), COVER],
    [
      'a formatter that is not a DateFormat',
      both({ field: 'private final java.text.Format format' }),
      undefined,
    ],
  ])('keeps the write copies for %s', (_name, files, reason) => {
    const { fixes, notes } = recipe.plan({ files, projectRoot: '/nonexistent' });
    const found = notes.map((note) => note.split('near-duplicate: ').at(-1));
    expect([
      fixes.length,
      found.length > 0,
      reason === undefined || found.includes(reason),
    ]).toEqual([1, true, true]);
  });
});
