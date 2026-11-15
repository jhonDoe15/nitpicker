import { describe, expect, it } from 'vitest';
import { javaExtractNearDuplicateRecipe as recipe } from '../near-duplicate-extract.mjs';
import { compileStatus, javacAvailable } from '../test-support/javac.mjs';
import { creator, creatorClass, urlAndUri } from '../test-support/creation-sources.mjs';
import { applied } from '../test-support/sources.mjs';

const PATH = 'src/main/java/demo/Adapters.java';

function plan(text) {
  const { fixes, notes } = recipe.plan({
    files: [{ path: PATH, text }],
    projectRoot: '/nonexistent',
  });
  const edits = fixes.flatMap((fix) => fix.edits);
  return { fixes, notes, after: fixes.length === 0 ? text : applied(text, edits) };
}

const STREAMS = creatorClass(creator('top', 'StringBuilder'), creator('bottom', 'StringBuffer'));
const GUARDED = (made) => `try {
            return ${made};
        } catch (IllegalStateException e) {
            return null;
        }`;
const CAUGHT = creatorClass(
  creator('top', 'StringBuilder', GUARDED),
  creator('bottom', 'StringBuffer', GUARDED),
);

const BOUNDED = creatorClass(
  creator('top', 'StringBuilder').replace('Object top', 'CharSequence top'),
  creator('bottom', 'StringBuffer').replace('Object bottom', 'CharSequence bottom'),
);

function guarded(type, kind) {
  return (made) => `try {
            return ${made};
        } catch (${type} e) {
            System.out.println("${kind} " + e.getMessage());
            return null;
        }`;
}

function opening(name, type, caught) {
  return creator(name, type, guarded(caught, name)).replace(
    `Object ${name}(List<String> source, int limit) {`,
    `Object ${name}(List<String> source, int limit) throws java.io.IOException {`,
  );
}

const UNCHECKED = creatorClass(
  opening('top', 'java.io.FileReader', 'IllegalArgumentException'),
  opening('bottom', 'java.io.FileInputStream', 'IllegalStateException'),
);
const WRAP =
  '    static final class Wrap extends IOException {\n        Wrap(Exception e) {}\n    }\n';
const SINGLE = urlAndUri({
  url: { handler: 'throw new Wrap(e);' },
  uri: { handler: 'throw new Wrap(e);' },
}).replace('final class Adapters {\n', `final class Adapters {\n${WRAP}`);

describe('javaExtractNearDuplicateRecipe with constructors that differ', () => {
  it('extracts two anonymous classes that differ in the constructor and the exception', () => {
    const { notes, after } = plan(urlAndUri());
    expect(notes).toEqual([]);
    expect(after).toMatchInlineSnapshot(`
      "package demo;

      import java.io.IOException;
      import java.net.MalformedURLException;
      import java.net.URI;
      import java.net.URISyntaxException;
      import java.net.URL;

      abstract class Adapter<T> {
          abstract T read(String in) throws IOException;
      }

      final class Adapters {
          static final Adapter<URL> URL_ADAPTER =
              new Adapter<URL>() {
                  @Override
                  public URL read(String in) throws IOException {
                      return sharedRead(in, "' as URL; at ", MalformedURLException.class, URL::new);
                  }
              };

          private static <U, E extends Exception> U sharedRead(
                  String in,
                  String value,
                  Class<E> failure,
                  StringCreator<U, E> creator) throws IOException {
              if (in.isEmpty()) {
                  return null;
              }
              String next = in.trim();
              if (next.equals("null")) {
                  return null;
              }
              try {
                  return creator.create(next);
              } catch (Exception caught) {
                  if (!failure.isInstance(caught)) {
                      throw (RuntimeException) caught;
                  }
                  E e = failure.cast(caught);
                  throw new IOException("Failed parsing '" + next + value + in.length(), e);
              }
          }

          private interface StringCreator<T, E extends Exception> {
              T create(String argument0) throws E;
          }

          static final Adapter<URI> URI_ADAPTER =
              new Adapter<URI>() {
                  @Override
                  public URI read(String in) throws IOException {
                      return sharedRead(in, "' as URI; at ", URISyntaxException.class, URI::new);
                  }
              };
      }
      "
    `);
  });

  it.runIf(javacAvailable())('produces anonymous-class code that compiles', () => {
    expect(compileStatus(plan(urlAndUri()).after)).toBe(0);
  });

  it('passes the constructor of a type that is only returned', () => {
    expect(plan(STREAMS).after).toMatchInlineSnapshot(`
      "package demo;

      import java.util.ArrayList;
      import java.util.List;

      class Make {
          Object top(List<String> source, int limit) {
              return sharedTop(source, limit, StringBuilder::new);
          }

          private static <T, E extends Exception> Object sharedTop(
                  List<String> source,
                  int limit,
                  StringCreator<T, E> creator) throws E {
              List<String> picked = new ArrayList<>();
              int seen = 0;
              for (String item : source) {
                  seen++;
                  if (picked.size() < limit) {
                      picked.add(item);
                  }
              }
              String joined = String.join(",", picked);
              return creator.create(joined);
          }

          private interface StringCreator<T, E extends Exception> {
              T create(String argument0) throws E;
          }

          Object bottom(List<String> source, int limit) {
              return sharedTop(source, limit, StringBuffer::new);
          }
      }
      "
    `);
  });

  it.runIf(javacAvailable())('produces constructor code that compiles', () => {
    expect(compileStatus(plan(STREAMS).after)).toBe(0);
  });

  it('keeps a catch clause for the same exception where the constructor is called', () => {
    expect(plan(CAUGHT).after).toMatchInlineSnapshot(`
      "package demo;

      import java.util.ArrayList;
      import java.util.List;

      class Make {
          Object top(List<String> source, int limit) {
              return sharedTop(source, limit, StringBuilder::new);
          }

          private static <T, E extends Exception> Object sharedTop(
                  List<String> source,
                  int limit,
                  StringCreator<T, E> creator) throws E {
              List<String> picked = new ArrayList<>();
              int seen = 0;
              for (String item : source) {
                  seen++;
                  if (picked.size() < limit) {
                      picked.add(item);
                  }
              }
              String joined = String.join(",", picked);
              try {
                  return creator.create(joined);
              } catch (IllegalStateException e) {
                  return null;
              }
          }

          private interface StringCreator<T, E extends Exception> {
              T create(String argument0) throws E;
          }

          Object bottom(List<String> source, int limit) {
              return sharedTop(source, limit, StringBuffer::new);
          }
      }
      "
    `);
  });

  it.runIf(javacAvailable())('produces code that compiles when the catch clause stays', () => {
    expect(compileStatus(plan(CAUGHT).after)).toBe(0);
  });

  it('bounds the type parameter by the type the copies return the constructor as', () => {
    const { fixes, after } = plan(BOUNDED);
    expect([fixes.length, after.includes('<T extends CharSequence, E extends Exception>')]).toEqual(
      [1, true],
    );
  });

  it.runIf(javacAvailable())('produces code that compiles when the type is bounded', () => {
    expect(compileStatus(plan(BOUNDED).after)).toBe(0);
  });

  it('rethrows what the shared code does not catch when the caught type is unchecked', () => {
    const { fixes, after } = plan(UNCHECKED);
    expect([fixes.length, after.includes('throw caught;')]).toEqual([1, true]);
  });

  it.runIf(javacAvailable())(
    'produces code that compiles when the caught type is unchecked',
    () => {
      expect(compileStatus(plan(UNCHECKED).after)).toBe(0);
    },
  );

  it('names an interface after the type arguments of a generic argument', () => {
    const text = creatorClass(
      creator('top', 'ArrayList', undefined, 'picked'),
      creator('bottom', 'java.util.LinkedList', undefined, 'picked'),
    );
    const { fixes, after } = plan(text);
    expect([fixes.length, after.includes('ListOfStringCreator')]).toEqual([1, true]);
  });

  it('passes the exception to a constructor that has one constructor of that size', () => {
    expect(plan(SINGLE).fixes.length).toBe(1);
  });

  it.runIf(javacAvailable())('produces code that compiles when the exception is passed on', () => {
    expect(compileStatus(plan(SINGLE).after)).toBe(0);
  });
});
