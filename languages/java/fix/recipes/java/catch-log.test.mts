import { describe, expect, it } from 'vitest';
import { applyRecipe, plannedLines } from '../kotlin/test-support/apply-recipe.mts';
import { javaCatchLogRecipe } from './catch-log.mts';

const PATH = 'src/main/java/demo/A.java';
const HEAD = 'class A {\n  private static final Logger log = LoggerFactory.getLogger(A.class);\n';

function inCatch(statement: string): string {
  return `${HEAD}  void f() {\n    try {\n      g();\n    } catch (IOException e) {\n      ${statement}\n    }\n  }\n}\n`;
}

function fixed(statement: string, path = PATH): string {
  return applyRecipe(javaCatchLogRecipe, inCatch(statement), path);
}

describe('javaCatchLogRecipe', () => {
  it.each([
    ['log.warn("could not load {}", id);', 'log.warn("could not load {}", id, e);'],
    ['log.error("failed " + e.getMessage());', 'log.error("failed " + e.getMessage(), e);'],
    ['log.fatal("failed");', 'log.fatal("failed", e);'],
    ['log.log(Level.SEVERE, "failed");', 'log.log(Level.SEVERE, "failed", e);'],
    ['log.warn(\n        "failed",\n      );', 'log.warn(\n        "failed", e,\n      );'],
  ])('appends the caught exception to %s', (statement, expected) => {
    expect(fixed(statement)).toBe(inCatch(expected));
  });

  it('fixes a test source as well', () => {
    expect(fixed('log.warn("x");', 'src/test/java/demo/ATest.java')).toBe(
      inCatch('log.warn("x", e);'),
    );
  });

  it('reports the line the call starts on', () => {
    expect(plannedLines(javaCatchLogRecipe, inCatch('log.warn("x");'), PATH)).toEqual([7]);
  });

  it.each([
    'log.warn("could not load {}", id, e);',
    'log.warn("failed", new IllegalStateException(e));',
    'log.info("fine");',
    'log.warning("no throwable overload");',
    'log.severe("no throwable overload");',
    'log.log(Level.SEVERE, "failed {0}", id);',
    'log.warn();',
    'log.warn("x" // why\n      );',
    'log.warn("x" /* why */\n      );',
  ])('leaves %s alone', (statement) => {
    expect(fixed(statement)).toBe(inCatch(statement));
  });

  it('leaves an ignored name, a rethrowing catch and other languages alone', () => {
    const ignored = inCatch('log.warn("x");').replace('IOException e', 'IOException ignored');
    const rethrown = inCatch('log.warn("x");\n      throw new IllegalStateException(e);');

    expect(applyRecipe(javaCatchLogRecipe, ignored, PATH)).toBe(ignored);
    expect(applyRecipe(javaCatchLogRecipe, rethrown, PATH)).toBe(rethrown);
    expect(applyRecipe(javaCatchLogRecipe, inCatch('log.warn("x");'), 'A.kt')).toBe(
      inCatch('log.warn("x");'),
    );
  });
});
