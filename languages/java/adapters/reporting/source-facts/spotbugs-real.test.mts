import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { callUntyped, findingsOf } from '../../typed/java-values.mts';
import { sarifFindings } from '../sarif/sarif-reports.mts';
import { withoutSourceBackedSpotbugs } from '../null-findings/spotbugs-log.mts';

const roots: string[] = [];
const URI = 'p/Ctl.java';

function result(ruleId: string, line: number, args: string[], logical: object) {
  return {
    ruleId,
    message: { id: 'default', text: 'generic', arguments: args },
    level: 'warning',
    locations: [
      {
        physicalLocation: { artifactLocation: { uri: URI }, region: { startLine: line } },
        logicalLocations: [logical],
      },
    ],
  };
}

const REPORT = JSON.stringify({
  version: '2.1.0',
  runs: [
    {
      tool: { driver: { name: 'SpotBugs', rules: [] } },
      results: [
        result('NP_NULL_ON_SOME_PATH', 10, ['order', 'p.Ctl.show(long)'], {
          name: 'order',
          kind: 'variable',
        }),
        result('NP_UNWRITTEN_PUBLIC_OR_PROTECTED_FIELD', 12, ['id', 'p.Ctl.count(Ctl$Req)'], {
          name: 'Ctl$Req.id',
          kind: 'member',
        }),
        result('UWF_UNWRITTEN_PUBLIC_OR_PROTECTED_FIELD', 12, ['p.Ctl$Req.items'], {
          name: 'Ctl$Req.items',
          kind: 'member',
        }),
        result('UWF_UNWRITTEN_PUBLIC_OR_PROTECTED_FIELD', 10, ['p.Ctl$Order.name'], {
          name: 'Ctl$Order.name',
          kind: 'member',
        }),
      ],
    },
  ],
});

function source(notFound: string, decode: string): string {
  return `package p;
public class Ctl {
    public static class Order { public String name; }
    public static class Req { public java.util.List<String> items; protected Long id; }
    static Order find(long id) { return id > 0 ? new Order() : null; }
    static void notFound(String msg) { ${notFound} }
    public static String show(long id) {
        Order order = find(id);
        if (order == null) { notFound("no order " + id); }
        return order.name;
    }
    public static int count(Req r) { return r.items.size() + (int) (long) r.id; }
    static Req parse(String json) { ${decode} }
}
`;
}

function reported(java: string): string[] {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-spotbugs-real-')));
  roots.push(root);
  mkdirSync(path.join(root, 'src/main/java/p'), { recursive: true });
  mkdirSync(path.join(root, 'reports'));
  writeFileSync(path.join(root, 'src/main/java', URI), java);
  writeFileSync(path.join(root, 'reports/spotbugs.sarif'), REPORT);
  writeFileSync(path.join(root, 'reports/pmd.sarif'), '');
  const sources = { projectRoot: root, sourceRoots: ['src/main/java'] };
  const context = {
    projectRoot: root,
    reportRoot: path.join(root, 'reports'),
    roots: [root],
    sourceRoots: ['src/main/java'],
    allSourceRoots: ['src/main/java'],
    manifest: {},
    spotbugsFilter: (log: unknown) => withoutSourceBackedSpotbugs(log, sources),
  };
  return findingsOf(callUntyped(sarifFindings, context)).map(
    (found) => `${found.rule}:${String(found.location?.line)}`,
  );
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

const RETURNS = 'if (msg.isEmpty()) return; System.out.println(msg);';
const THROWS = 'throw new IllegalStateException(msg);';
const UNBOUND = 'return null;';
const BOUND = 'return new com.google.gson.Gson().fromJson(json, Req.class);';

describe('SpotBugs findings read from a real report', () => {
  it('keeps the null dereference when notFound can return, and the unbound Req fields', () => {
    expect(reported(source(RETURNS, UNBOUND))).toEqual([
      'NP_NULL_ON_SOME_PATH:10',
      'NP_UNWRITTEN_PUBLIC_OR_PROTECTED_FIELD:12',
      'UWF_UNWRITTEN_PUBLIC_OR_PROTECTED_FIELD:12',
      'UWF_UNWRITTEN_PUBLIC_OR_PROTECTED_FIELD:10',
    ]);
  });

  it('drops the null dereference when notFound always throws', () => {
    expect(reported(source(THROWS, UNBOUND))).not.toContain('NP_NULL_ON_SOME_PATH:10');
  });

  it('drops the unwritten Req fields once Req is a fromJson target, not Order.name', () => {
    expect(reported(source(RETURNS, BOUND))).toEqual([
      'NP_NULL_ON_SOME_PATH:10',
      'UWF_UNWRITTEN_PUBLIC_OR_PROTECTED_FIELD:10',
    ]);
  });
});
