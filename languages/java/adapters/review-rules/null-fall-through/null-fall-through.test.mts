import { describe, expect, it } from 'vitest';
import { PROJECT, useTempProjects, type ReadOptions } from '../test-support/temp-projects.mts';
import { readNullFallThroughFindings as untypedRead } from './null-fall-through.mjs';

type Finding = {
  readonly rule: string;
  readonly message: string;
  readonly location: { readonly line: number };
};

const read: (projectRoot: string, options: ReadOptions) => Finding[] = untypedRead;

const projectWith = useTempProjects('nitpicker-jvm-null-');

function scan(file: string, text: string, kotlin: boolean) {
  return read(projectWith({ [file]: text }), { projects: [PROJECT], kotlin });
}

function java(body: string) {
  return scan(
    'src/main/java/shop/Writer.java',
    `package shop;\nclass Writer {\n${body}\n}\n`,
    false,
  ).map(({ location }) => location.line);
}

function kotlin(body: string) {
  return scan(
    'src/main/kotlin/shop/Writer.kt',
    `package shop\nclass Writer {\n${body}\n}\n`,
    true,
  ).map(({ location }) => location.line);
}

describe('NullBranchFallThrough in Java', () => {
  it('reports the Defects4J shape: a null branch that writes and falls through to a dereference', () => {
    const findings = scan(
      'src/main/java/shop/Writer.java',
      `package shop;
class Writer {
  void write(Object value, String format) {
    if (value == null) {
      out.append("null");
    }
    String chosen = format;
    if (chosen == null) {
      chosen = formats.get(value.getClass());
    }
    out.append(String.format(chosen, value));
  }
}
`,
      false,
    );
    expect(findings.map(({ rule, location }) => `${rule}:${String(location.line)}`)).toEqual([
      'NullBranchFallThrough:4',
    ]);
    expect(findings[0]?.message).toBe(
      'The null branch handles `value` and then falls through to `value.getClass()`, which uses `value`; add `return` (or an `else`) so the null case is handled once. If this is intended, add {"rule":"pmd/NullBranchFallThrough","paths":["src/main/java/shop/Writer.java"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
    );
  });

  it('reports a log-then-continue branch, a reversed check and a field', () => {
    expect(
      java(`  void a(String s) {
    if (s == null) log.warn("missing");
    use(s.trim());
  }
  void b(String s) {
    if (null == s) {
      log.warn("missing");
    }
    use(s.length());
  }
  void c() {
    if (this.name == null) {
      log.warn("missing");
    }
    use(this.name.length());
  }`),
    ).toEqual([4, 8, 14]);
  });

  it('reports unboxing, iteration and a repeat of the branch call', () => {
    expect(
      java(`  int a(Integer n) {
    if (n == null) {
      log.warn("none");
    }
    return n + 1;
  }
  void b(List<String> items) {
    if (items == null) {
      log.warn("none");
    }
    for (String item : items) {
      use(item);
    }
  }
  void c(String value) {
    if (value == null) {
      out.append("null");
    }
    out.append(value);
  }`),
    ).toEqual([4, 10, 18]);
  });

  it('does not report a branch that leaves, assigns, has an else or does nothing', () => {
    expect(
      java(`  void a(String s) {
    if (s == null) {
      log.warn("missing");
      return;
    }
    use(s.trim());
  }
  void b(String s) {
    if (s == null) {
      throw new IllegalArgumentException("s");
    }
    use(s.trim());
  }
  void c(String s) {
    if (s == null) {
      log.warn("missing");
      s = "";
    }
    use(s.trim());
  }
  void d(String s) {
    if (s == null) {
      log.warn("missing");
    } else {
      use(s.trim());
    }
  }
  void e(String s) {
    if (s == null) {
    }
    use(s.trim());
  }
  void f(String s) {
    if (s == null) {
      System.exit(1);
    }
    use(s.trim());
  }
  void g(List<String> items) {
    for (String s : items) {
      if (s == null) {
        log.warn("missing");
        continue;
      }
      use(s.trim());
    }
  }`),
    ).toEqual([]);
  });

  it('does not report null-safe or guarded later uses', () => {
    expect(
      java(`  void a(Object v) {
    if (v == null) {
      log.warn("missing");
    }
    use(String.valueOf(v), Objects.toString(v), "" + v, v == other);
  }
  void b(String v) {
    if (v == null) {
      log.warn("missing");
    }
    if (v != null) {
      use(v.trim());
    }
  }
  void c(String v) {
    if (v == null) {
      log.warn("missing");
    }
    v = normalise(v);
    use(v.trim());
  }
  void d(String v, String w) {
    if (v == null) {
      log.warn("missing");
    }
    use(w.trim());
  }
  void e(String v) {
    if (v == null && flag) {
      log.warn("missing");
    }
    use(v.trim());
  }`),
    ).toEqual([]);
  });
});

describe('NullBranchFallThrough in Kotlin', () => {
  it('reports a branch that logs and then uses the value', () => {
    expect(
      kotlin(`  fun a(name: String?) {
    if (name == null) {
      log.warn("missing")
    }
    use(name!!.trim())
  }
  fun b(name: String?) {
    if (name == null) log.warn("missing")
    println(name!!.length)
  }`),
    ).toEqual([4, 10]);
  });

  it('does not report leaving, else or null-safe forms', () => {
    expect(
      kotlin(`  fun a(name: String?) {
    if (name == null) {
      log.warn("missing")
      return
    }
    use(name.trim())
  }
  fun b(name: String?) {
    if (name == null) {
      log.warn("missing")
    } else {
      use(name.trim())
    }
  }
  fun c(name: String?) {
    if (name == null) {
      log.warn("missing")
    }
    use(name?.trim() ?: "")
  }
  fun d(name: String?) {
    if (name == null) {
      log.warn("missing")
    }
    use(name.orEmpty())
  }`),
    ).toEqual([]);
  });
});

describe('NullBranchFallThrough with lazily initialised fields', () => {
  it('stays quiet when a field branch calls a method that may set it', () => {
    expect(
      java(`  Conn conn;
  Object q() {
    if (conn == null) {
      connect();
    }
    return conn.query();
  }
  Object r() {
    if (this.conn == null) {
      this.connect();
    }
    return this.conn.query();
  }`),
    ).toEqual([]);
  });

  it('reports a field whose branch only writes a placeholder, and a local that a call cannot set', () => {
    expect(
      java(`  Conn conn;
  Object q() {
    if (conn == null) {
      out.append("none");
    }
    return conn.query();
  }
  Object r(Conn local) {
    if (local == null) {
      connect();
    }
    return local.query();
  }
  Object s() {
    Conn made = make();
    if (made == null) {
      connect();
    }
    return made.query();
  }`),
    ).toEqual([5, 11, 18]);
  });

  it('stays quiet for a Kotlin property set by a call', () => {
    expect(
      kotlin(`  var conn: Conn? = null
  fun q(): Any {
    if (conn == null) {
      connect()
    }
    return conn!!.query()
  }`),
    ).toEqual([]);
  });
});
