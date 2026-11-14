import { describe, expect, it } from 'vitest';
import { javaExtractNearDuplicateRecipe as recipe } from '../near-duplicate-extract.mjs';
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
const EXCEPTION_USE =
  'the catch body uses the exception where its type cannot be shared: only a call of a Throwable method or an argument of a new object';
const RESULT =
  'a constructor of a differing type is used where its type matters: only a return, an assignment or a declared local may take it';
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
});
