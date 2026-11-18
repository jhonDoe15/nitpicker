import { describe, expect, it } from 'vitest';
import { writeFiles } from '../../../../../core/diff/git/test-support/fixture-files.mts';
import { useGitFixtures } from '../../../../../core/diff/git/test-support/git-repository.mts';
import { fieldOf, listOf, numberOr } from '../../../../../shared/values/readers.mts';
import { withoutNeverReturningNulls } from './never-returns.mts';

const { temporaryRoot } = useGitFixtures();
const FILE = 'src/main/java/demo/Ctl.java';

function finding(line: number, ruleId = 'NP_NULL_ON_SOME_PATH', variable = 'order') {
  return {
    ruleId,
    message: { arguments: [variable, 'demo.Ctl.show(long)'] },
    locations: [
      {
        physicalLocation: { artifactLocation: { uri: FILE }, region: { startLine: line } },
        logicalLocations: [{ name: variable, kind: 'variable' }],
      },
    ],
  };
}

function lineOf(result: unknown): number {
  const location = fieldOf(listOf(fieldOf(result, 'locations'))[0], 'physicalLocation');
  return numberOr(fieldOf(fieldOf(location, 'region'), 'startLine'), 0);
}

function kept(source: string, ...lines: number[]): number[] {
  const root = temporaryRoot('never-returns-');
  writeFiles(root, { [FILE]: source });
  return withoutNeverReturningNulls(
    lines.map((line) => finding(line)),
    { projectRoot: root, sourceRoots: ['src/main/java'] },
  ).map(lineOf);
}

const PROJECT_METHOD = `package demo;
class Ctl {
    static void notFound(String msg) { throw new IllegalStateException(msg); }

    static String show(long id) {
        Order order = find(id);
        if (order == null) {
            notFound("no order " + id);
        }
        return order.name;
    }

    static String quiet(long id) {
        Order order = find(id);
        if (order == null) {
            log("missing");
        }
        return order.name;
    }
}
`;

describe('withoutNeverReturningNulls', () => {
  it('drops a null dereference after a branch that calls a method which always throws', () => {
    expect(kept(PROJECT_METHOD, 10)).toEqual([]);
  });

  it('keeps a null dereference when the null branch returns normally', () => {
    expect(kept(PROJECT_METHOD, 17)).toEqual([17]);
  });

  it.each([
    {
      name: 'keeps the finding when the variable is reassigned after the branch',
      source: `class Ctl {
    static void stop() { throw new IllegalStateException(); }
    static String show(Order order) {
        if (order == null) {
            stop();
        }
        order = other();
        return order.name;
    }
}
`,
      line: 8,
    },
    {
      name: 'keeps a method that only throws on some paths',
      source: `class Ctl {
    static void maybe(boolean fail) { if (fail) { throw new IllegalStateException(); } }
    static String show(Order order) {
        if (order == null) {
            maybe(true);
        }
        return order.name;
    }
}
`,
      line: 7,
    },
    {
      name: 'ignores the Play method names outside a Play controller',
      source: `class Orders {
    static String show(long id) {
        Order order = find(id);
        if (order == null) {
            notFound("no order " + id);
        }
        return order.name;
    }
}
`,
      line: 7,
    },
    {
      name: 'keeps the finding after a logger or other receiver call that shares a Play name',
      source: `import play.mvc.Controller;
class Orders extends Controller {
    static String show(long id) {
        Order order = find(id);
        if (order == null) {
            Logger.error("missing");
        }
        return order.name;
    }
}
`,
      line: 8,
    },
    {
      name: 'keeps the finding after a Play 2 result helper, which returns',
      source: `import play.mvc.Controller;
import play.mvc.Result;
class Orders extends Controller {
    Result show(long id) {
        Order order = find(id);
        if (order == null) {
            ok("none");
        }
        return ok(order.name);
    }
}
`,
      line: 9,
    },
  ])('$name', ({ source, line }) => {
    expect(kept(source, line)).toEqual([line]);
  });

  it('knows the Play controller methods that end the request', () => {
    const source = `import play.mvc.Controller;
class Orders extends Controller {
    static String show(long id) {
        Order order = find(id);
        if (order == null || order.hidden) {
            notFound("no order " + id);
        }
        return order.name;
    }
}
`;

    expect(kept(source, 8)).toEqual([]);
  });

  it('accepts the declaring class as receiver of a project method that always throws', () => {
    const source = `class Ctl {
    static void stop() { throw new IllegalStateException(); }
    static String show(Order order) {
        if (order == null) {
            Ctl.stop();
        }
        return order.name;
    }
    static String other(Order order) {
        if (order == null) {
            helper.stop();
        }
        return order.name;
    }
}
`;

    expect(kept(source, 7, 13)).toEqual([13]);
  });

  it('keeps other rules and findings about another variable', () => {
    const root = temporaryRoot('never-returns-');
    writeFiles(root, { [FILE]: PROJECT_METHOD });
    const others = [
      finding(10, 'DM_DEFAULT_ENCODING'),
      finding(10, 'NP_NULL_ON_SOME_PATH', 'other'),
    ];

    expect(
      withoutNeverReturningNulls(others, { projectRoot: root, sourceRoots: ['src/main/java'] }),
    ).toHaveLength(2);
  });
});
