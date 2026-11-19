import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { projectWideReport } from '../../../../builds/project-wide.mts';
import { PROJECT, useTempProjects } from '../../test-support/temp-projects.mts';
import {
  NULLABLE_RETURN_RULE,
  nullableReturnUses,
  readNullableReturnFindings,
} from '../nullable-returns.mts';
import { MARK, flaggedReport, peers, reported, sample } from '../test-support/samples.mts';

const projectWith = useTempProjects('nitpicker-nullable-');

describe('NullableReturnUse: resolution and forms', () => {
  const find = `  Object find(String key) {
    if (key.isEmpty()) {
      return null;
    }
    return key;
  }
${peers('find')}`;

  it('says the use throws when a documented null has no caller that checks', () => {
    const [message] = nullableReturnUses([
      {
        file: 'Sample.java',
        text: sample(`  /**
   * @return the parent, or null if there is none
   */
  Sample parent() { return up; }
  Sample up;
  Sample root() { return parent().parent(); }`),
      },
    ]).map((use) => use.message);
    expect(message).toBe(
      [
        '`Sample.parent` documents that it may return `null`, on line 7 of Sample.java, and',
        'the result of `Sample.parent` is dereferenced here without a null check, which throws',
        'NullPointerException on that path; add `if (result == null) return ...;` or annotate',
        'the method `@Nullable` and handle it. If the caller knows from context that the value',
        'is set, add `Objects.requireNonNull(result, "why")` to document it.',
      ].join(' '),
    );
  });

  it('does not resolve a call in a nested class with a superclass to the outer method', () => {
    const text = `package shop;
class Base {
  Object find(String key) { return key; }
}
class Outer {
${find}  class Inner extends Base {
    int a(String key) { return find(key).hashCode(); }
  }
  class Plain {
    int b(String key) { return find(key).hashCode(); } ${MARK}
  }
}
`;
    const { found, marked } = flaggedReport(text);
    expect(found).toEqual(marked);
  });

  it('follows var, a cast and an unboxing cast between the call and the local', () => {
    const { found, marked } = flaggedReport(
      sample(`${find}  int a(String key) {
    var o = find(key);
    return o.hashCode(); ${MARK}
  }
  int b(String key) {
    Object o = (Object) find(key);
    return o.hashCode(); ${MARK}
  }
  int c(String key) {
    int n = (Integer) find(key); ${MARK}
    return n;
  }`),
    );
    expect(found).toEqual(marked);
  });

  it('reads abstract and interface methods as targets for the documented and caller signals', () => {
    const iface = `package shop;
interface Store {
  /**
   * @return the value, or null if the key is unknown
   */
  Object get(String key);
  Object peek(String key);
}
`;
    const impls = `package shop;
class MemoryStore implements Store {
  public Object get(String key) { return key; }
  public Object peek(String key) { return key; }
}
class DiskStore implements Store {
  public Object get(String key) { return key; }
  public Object peek(String key) { return key; }
}
`;
    const users = `package shop;
class Users {
  Store store;
  int a(String key) { return store.get(key).hashCode(); }
  boolean p1(String k) { return store.peek(k) != null; }
  boolean p2(String k) { return store.peek(k) != null; }
  boolean p3(String k) { return store.peek(k) != null; }
  boolean p4(String k) { return store.peek(k) != null; }
  int b(String key) { return store.peek(key).hashCode(); }
}
`;
    expect(reported({ 'Store.java': iface, 'Impls.java': impls, 'Users.java': users })).toEqual([
      'Users.java:4',
      'Users.java:9',
    ]);
  });

  it('resolves a single static import but not a wildcard static import', () => {
    const owner = `package shop.util;
public class Finder {
  public static Object sfind(String key) {
    if (key.isEmpty()) {
      return null;
    }
    return key;
  }
${peers('sfind')}}
`
      .replaceAll('Peer', 'Peer')
      .replaceAll('  boolean ', '  static boolean ');
    const user = (imports: string) => `package shop.app;
${imports}
class User {
  int a(String key) { return sfind(key).hashCode(); }
}
`;
    expect(
      reported({
        'Finder.java': owner,
        'User.java': user('import static shop.util.Finder.sfind;'),
      }),
    ).toEqual(['User.java:4']);
    expect(
      reported({ 'Finder.java': owner, 'User.java': user('import static shop.util.Finder.*;') }),
    ).toEqual([]);
  });
});

describe('NullableReturnUse: sources and type names', () => {
  const lib = `package a;
public class Provider {
  public Object find(String key) {
    if (key.isEmpty()) {
      return null;
    }
    return key;
  }
  public boolean peer(String key) { return find(key) != null; }
}
`;
  const caller = (imports: string) => `package b;
${imports}
class Consumer {
  Provider provider;
  int use(String key) {
    return provider.find(key).hashCode();
  }
}
`;

  it('resolves a type through an explicit import or a wildcard import', () => {
    expect(
      reported({ 'a/Provider.java': lib, 'b/Consumer.java': caller('import a.Provider;') }),
    ).toEqual(['b/Consumer.java:6']);
    expect(reported({ 'a/Provider.java': lib, 'b/Consumer.java': caller('import a.*;') })).toEqual([
      'b/Consumer.java:6',
    ]);
  });

  it('does not resolve a type that is not imported or comes from another package', () => {
    expect(reported({ 'a/Provider.java': lib, 'b/Consumer.java': caller('') })).toEqual([]);
    expect(
      reported({
        'a/Provider.java': lib,
        'b/Consumer.java': caller('import c.Provider;'),
      }),
    ).toEqual([]);
  });

  it('skips a type name that two visible classes share', () => {
    const twin = lib.replace('package a;', 'package b;');
    expect(
      reported({
        'a/Provider.java': lib,
        'b/Provider.java': twin,
        'b/Consumer.java': caller('import a.*;'),
      }),
    ).toEqual([]);
  });

  it('reads only Java files of the main sources', () => {
    const root = projectWith({
      'src/main/java/shop/Sample.java': sample(
        `  Object find(String key) { if (key.isEmpty()) { return null; } return key; }
  boolean peer(String key) { return find(key) != null; }
  int a(String key) { return find(key).hashCode(); }`,
      ),
      'src/test/java/shop/SampleTest.java': sample(
        `  Object find(String key) { if (key.isEmpty()) { return null; } return key; }
  boolean peer(String key) { return find(key) != null; }
  int a(String key) { return find(key).hashCode(); }`,
      ),
      'src/main/kotlin/shop/Sample.kt': 'package shop\nclass Sample\n',
    });
    const findings = readNullableReturnFindings(root, { projects: [PROJECT], kotlin: true });
    expect(
      findings.map(({ rule, path: file, location }) => `${rule}:${file}:${String(location.line)}`),
    ).toEqual(['NullableReturnUse:src/main/java/shop/Sample.java:6']);
    expect(findings[0]?.message).toBe(
      [
        '`Sample.find` returns `null` on line 4 of src/main/java/shop/Sample.java, and other',
        'callers check it, and the result of `Sample.find` is dereferenced here without a null',
        'check, which can throw NullPointerException on that path; add `if (result == null)',
        'return ...;` or annotate the method `@Nullable` and handle it. If the caller knows',
        'from context that the value is set, add `Objects.requireNonNull(result, "why")` to',
        'document it. If this is intended, add',
        '{"rule":"pmd/NullableReturnUse","paths":["src/main/java/shop/Sample.java"],"reason":"..."}',
        'to "exceptions" in nitpicker.config.json.',
      ].join(' '),
    );
  });
});

describe('the project-wide report', () => {
  it('includes the finding of a caller in another module', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-nullable-wide-'));
    try {
      const modules = {
        'core/src/main/java/shop/core/Registry.java': `package shop.core;
public class Registry {
  public Object find(String key) {
    if (key.isEmpty()) {
      return null;
    }
    return key;
  }
  public boolean has(String key) { return find(key) != null; }
}
`,
        'web/src/main/java/shop/web/Page.java': `package shop.web;
import shop.core.Registry;
class Page {
  private final Registry registry = new Registry();
  int size(String key) {
    return registry.find(key).hashCode();
  }
}
`,
      };
      for (const [file, text] of Object.entries(modules)) {
        mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
        writeFileSync(path.join(root, file), text);
      }
      const project = (module: string) => ({
        reportRoot: path.join(root, module, 'reports'),
        qualifier: module,
        sourceRoots: [`${module}/src/main/java`],
        testSourceRoots: [],
        kotlinSourceRoots: [],
        kotlinTestSourceRoots: [],
      });
      const { findings } = projectWideReport(root, {
        projects: [project('core'), project('web')],
        mergedRoot: path.join(root, 'merged'),
        manifest: { sourceRoots: ['core/src/main/java', 'web/src/main/java'] },
        kotlin: false,
        policy: {},
      });

      expect(
        findings
          .filter(({ rule }) => rule === NULLABLE_RETURN_RULE)
          .map(({ path: file, location }) => `${file}:${String(location?.line)}`),
      ).toEqual(['web/src/main/java/shop/web/Page.java:6']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
