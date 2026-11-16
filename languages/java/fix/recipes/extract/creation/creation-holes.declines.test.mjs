import { describe, expect, it } from 'vitest';
import { javaExtractNearDuplicateRecipe as recipe } from '../near-duplicate-extract.mts';
import { creator, creatorClass, urlAndUri } from '../test-support/creation-sources.mjs';

const PATH = 'src/main/java/demo/Adapters.java';

function reasons(text) {
  const { fixes, notes } = recipe.plan({
    files: [{ path: PATH, text }],
    projectRoot: '/nonexistent',
  });
  return { fixes: fixes.length, notes: notes.map((note) => note.split('near-duplicate: ').at(-1)) };
}

const TRY_ONLY =
  'a catch clause of a differing exception type needs a try that is only a constructor call';
const EXCEPTION_USE = [
  'the catch body uses the exception where its type cannot be shared: only a call of a Throwable method',
  'or an argument of a new object whose class has one constructor of that size',
].join(' ');
const RESULT = [
  'a constructor of a differing type is used where its type matters:',
  'only a return, an assignment or a declared local may take it',
].join(' ');
const ARGUMENTS =
  'the arguments of a constructor of a differing type have no type the shared code can write';
const NAMES = 'the shared code has no free names for its extra parameters';

function pair(use, argument) {
  return creatorClass(
    creator('top', 'StringBuilder', use, argument),
    creator('bottom', 'StringBuffer', use, argument),
  );
}

describe('javaExtractNearDuplicateRecipe declines constructors that differ', () => {
  it.each([
    [
      'a try that calls a method',
      urlAndUri({
        url: { body: 'return new URL(next.trim());' },
        uri: { body: 'return new URI(next.trim());' },
      }),
      TRY_ONLY,
    ],
    [
      'a catch body that passes the exception to a call',
      urlAndUri({
        url: { handler: 'throw new IOException(String.valueOf(e), e);' },
        uri: { handler: 'throw new IOException(String.valueOf(e), e);' },
      }),
      EXCEPTION_USE,
    ],
    [
      'a catch clause that is not the last one',
      urlAndUri({
        url: {
          more: ' catch (IllegalStateException e) {\n                    return null;\n                }',
        },
        uri: {
          more: ' catch (IllegalStateException e) {\n                    return null;\n                }',
        },
      }),
      TRY_ONLY,
    ],
    ['a constructor that is a receiver', pair((made) => `return ${made}.length();`), RESULT],
    ['a constructor passed to a call', pair((made) => `return String.valueOf(${made});`), RESULT],
    ['a constructor with an untyped argument', pair(undefined, 'joined.substring(1)'), ARGUMENTS],
  ])('leaves the source alone for %s', (_name, source, reason) => {
    const found = reasons(source);
    expect([found.fixes, found.notes]).toEqual([0, [reason]]);
  });

  it('leaves the source alone when the interface name is taken', () => {
    const source = pair().replace('class Make {', 'class Make {\n    interface StringCreator {}\n');
    expect(reasons(source)).toEqual({ fixes: 0, notes: [NAMES] });
  });

  it('declines a catch body that passes the exception to an overloaded constructor', () => {
    const wrap = `    static final class Wrap extends IOException {
        Wrap(Exception e) {}
        Wrap(MalformedURLException e) {}
        Wrap(URISyntaxException e) {}
    }
`;
    const text = urlAndUri({
      url: { handler: 'throw new Wrap(e);' },
      uri: { handler: 'throw new Wrap(e);' },
    }).replace('final class Adapters {\n', `final class Adapters {\n${wrap}`);
    expect(reasons(text)).toEqual({ fixes: 0, notes: [EXCEPTION_USE] });
  });

  it('declines a raw constructor that is returned as a parameterized type', () => {
    const typed = (name, type) =>
      creator(name, type, undefined, 'picked').replace(
        `Object ${name}`,
        `java.util.Set<String> ${name}`,
      );
    const text = creatorClass(
      typed('top', 'java.util.HashSet'),
      typed('bottom', 'java.util.TreeSet'),
    );
    expect(reasons(text)).toEqual({
      fixes: 0,
      notes: [
        'a constructor of a differing type is returned or stored as a type the shared code cannot name',
      ],
    });
  });
});
