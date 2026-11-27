import { describe, expect, it } from 'vitest';
import { PROJECT, useTempProjects } from '../test-support/temp-projects.mts';
import { parseSource } from '../max-value-sums/source/source-file.mts';
import { kindAt, lineAt, openerAt, partnerAt, textAt } from './own-regions.mts';
import {
  HIDDEN_INHERITED_FIELD_RULE,
  readHiddenInheritedFieldFindings,
} from './hidden-inherited-field.mts';

const projectWith = useTempProjects('nitpicker-hidden-inherited-');

function scan(files: Readonly<Record<string, string>>) {
  const sources = Object.fromEntries(
    Object.entries(files).map(([name, text]) => {
      if (name.includes('/')) {
        return [`src/main/java/${name}.java`, `${text}\n`];
      }
      const pkg = /^package ([\w.]+);/u.exec(text)?.[1] ?? 'shop';
      const body = text.startsWith('package') ? text : `package shop;\n${text}`;
      return [`src/main/java/${pkg.replaceAll('.', '/')}/${name}.java`, `${body}\n`];
    }),
  );
  return readHiddenInheritedFieldFindings(projectWith(sources), {
    projects: [PROJECT],
    kotlin: false,
  });
}

function lines(files: Readonly<Record<string, string>>): [string, number, string][] {
  return scan(files).map(({ path, location, symbol }) => [path, location.line, symbol]);
}

const BASE = `public abstract class Base {
  protected int size;
  public String label;
  int count;
  private String secret;
  protected static int shared;
}`;

const LEFT_OUT: { title: string; files: Record<string, string> }[] = [
  {
    title: 'constructor, setter and assigning parameters, and statics',
    files: {
      Base: BASE,
      Child: `class Child extends Base {
  Child(int size, String label) { super(); this.size = size; System.out.println(label); }
  void setSize(int size) { super.size = size; }
  Child withLabel(String label) { return new Child(size, label); }
  void reset(int size) { this.size = size; }
  static int twice(int size) { return size * 2; }
  static int shared() { int shared = 1; return shared + Base.shared; }
  int read() { return size + label.length(); }
}`,
    },
  },
  {
    title: 'names the class never uses as the inherited field',
    files: {
      Base: BASE,
      Child: `class Child extends Base {
  int grow(int by) { int size = by * 2; return size; }
  @Tag(label = "x")
  String name(String label) { return label; }
  int other(Child c) { return c.size + size(); }
  boolean over(int by, int limit) { return by > limit; }
}`,
    },
  },
  {
    title: 'private fields, package-private fields of another package and library superclasses',
    files: {
      Base: `package shop.base;\n${BASE}`,
      Child: `import shop.base.Base;
class Child extends Base {
  int scaled() { int count = 2; String secret = "x"; return count + this.count + secret.length() + secret; }
}`,
      Framework: `import org.springframework.Bean;
class Framework extends Bean {
  protected Object logger;
  void log() { Object logger = new Object(); System.out.println(logger + this.logger); }
}`,
    },
  },
  {
    title: 'anonymous and nested classes, and a field the class declares itself',
    files: {
      Base: BASE,
      Child: `class Child extends Base {
  private int count;
  Runnable task() {
    return new Runnable() {
      private int size;
      public void run() { int size = 1; System.out.println(size + this.size); }
    };
  }
  static class Inner {
    int size() { int size = 1; return size; }
  }
  int read() { int count = 1; return count + this.count; }
  int total() { return size; }
}`,
    },
  },
  {
    title: 'type-parameter and wildcard bounds, which are not superclasses',
    files: {
      Base: BASE,
      Outer: `class Outer {
  int size;
  class Holder<T extends Base> {
    int f(int size) { return size; }
    int g() { return size; }
  }
}`,
      Supplying: `class Supplying implements java.util.function.Supplier<java.util.List<? extends Base>> {
  public java.util.List<? extends Base> get() { int size = 1; return null; }
  int g() { return size; }
}`,
    },
  },
  {
    title:
      'a same-package superclass name shadowed by neither a wildcard import nor a qualified name',
    files: {
      'c/Base': 'package c;\npublic class Base { protected int other; }',
      'd/Base': 'package d;\npublic class Base { protected int size; }',
      'c/Child': `package c;
import d.*;
class Child extends Base {
  int x() { int size = 1; return size; }
  int y() { return size; }
}`,
      'c/Qualified': `package c;
class Qualified extends c.Base {
  int x() { int size = 1; return size + this.size; }
}`,
    },
  },
  {
    title: 'parameters never read, passed to the overridden method or assigned in a wrapped form',
    files: {
      Base: BASE,
      Child: `class Child extends Base {
  void handle(String label) { System.out.println("x"); }
  @Override public void init(int size) { super.init(size); }
  void named(String label) { this.label = java.util.Objects.requireNonNull(label); }
  void trimmed(String label) { super.label = label.trim(); }
  void guarded(String label) { if (label != null) { this.label = label; } }
  int read() { return size + label.length(); }
}`,
    },
  },
  {
    title: 'package prefixes, case labels, cast types and the field of an enclosing instance',
    files: {
      Base: 'public class Base { protected String org; protected int B; protected Object String; }',
      Child: `class Child extends Base {
  Object f(String org) { return org; }
  Object g() { org.slf4j.Logger l = null; return l; }
  int h(int B) { return B; }
  int k(E e) { return switch (e) { case A, B -> 1; default -> 0; }; }
  Object m(Object o) { return (String) o; }
}`,
      Outer: `class Outer extends Base {
  class Inner extends Base {
    int f() { int B = 1; return B + Outer.this.B; }
  }
}`,
    },
  },
];

describe('HiddenInheritedField', () => {
  it('reports a local that hides a field the class also reads through this', () => {
    const found = scan({
      Base: BASE,
      Child: `class Child extends Base {
  int grow(int by) {
    int size = by * 2;
    return size + this.size;
  }
}`,
    });
    expect(found.map(({ rule, path, location }) => [rule, path, location.line])).toEqual([
      [HIDDEN_INHERITED_FIELD_RULE, 'src/main/java/shop/Child.java', 4],
    ]);
    expect(found[0]?.message).toBe(
      'The variable `size` has the name of the field `size` that this class inherits from ' +
        '`Base` and also uses, so the short name `size` means two things in one class. Rename ' +
        'the variable after its own role. An exception fits only when the name is fixed from ' +
        'outside, such as a name a framework or a generated API requires. If this is intended, ' +
        'add {"rule":"pmd/HiddenInheritedField","paths":["src/main/java/shop/Child.java"],' +
        '"reason":"..."} to "exceptions" in nitpicker.config.json.',
    );
  });

  it('reports parameters, lambda, pattern and for-each variables used next to a short-name read', () => {
    const found = lines({
      Base: BASE,
      Child: `class Child extends Base {
  int total() { return size + count; }
  void resize(int size) { System.out.println(size); }
  void each(java.util.List<String> labels) {
    labels.forEach(label -> System.out.println(label));
    for (String count : labels) { System.out.println(count); }
  }
  boolean check(Object value) {
    return value instanceof String label && label.isEmpty();
  }
  String read() { return label; }
}`,
    });
    expect(found).toEqual([
      ['src/main/java/shop/Child.java', 4, 'size'],
      ['src/main/java/shop/Child.java', 6, 'label'],
      ['src/main/java/shop/Child.java', 10, 'label'],
      ['src/main/java/shop/Child.java', 7, 'count'],
    ]);
  });

  it('follows the superclass chain and reports a field that hides one read through super', () => {
    const found = lines({
      Base: BASE,
      Middle: 'abstract class Middle extends Base { }',
      Child: `class Child extends Middle {
  private final long size;
  Child() { this.size = super.size; }
}`,
    });
    expect(found).toEqual([['src/main/java/shop/Child.java', 3, 'size']]);
  });

  it('resolves a superclass imported from another package of the project', () => {
    const found = lines({
      Base: `package shop.base;\n${BASE}`,
      Child: `import shop.base.Base;
class Child extends Base {
  int scaled() { int size = 2; return size * this.size; }
  int counted() { int count = 3; return count + this.count; }
}`,
    });
    expect(found).toEqual([['src/main/java/shop/Child.java', 4, 'size']]);
  });

  it('reads the superclass past type-parameter bounds and by its qualified name', () => {
    const found = lines({
      'a/Base':
        'package a;\npublic class Base<T> { protected T value; protected int a, b = 2, size; }',
      'c/Child': `package c;
class Child<V extends Comparable<V>> extends a.Base<V> {
  V get() { return value; }
  V other() { V value = null; return value; }
  int grow() { int size = 2; return size + this.size; }
}`,
    });
    expect(found).toEqual([
      ['src/main/java/c/Child.java', 4, 'value'],
      ['src/main/java/c/Child.java', 5, 'size'],
    ]);
  });

  it('counts a short-name read earlier in the method than the local', () => {
    const found = lines({
      Base: BASE,
      Child: `class Child extends Base {
  int f() { int a = size; { int size = 2; a += size; } return a; }
}`,
    });
    expect(found).toEqual([['src/main/java/shop/Child.java', 3, 'size']]);
  });

  it.each(LEFT_OUT)('leaves out $title', ({ files }) => {
    expect(lines(files)).toEqual([]);
  });

  it('reads Java sources only', () => {
    const root = projectWith({
      'src/main/java/shop/Base.java': `package shop;\n${BASE}\n`,
      'src/main/kotlin/shop/Child.kt':
        'package shop\nclass Child : Base() {\n  fun grow(): Int { val size = 2; return size + this.size }\n}\n',
    });
    expect(readHiddenInheritedFieldFindings(root, { projects: [PROJECT], kotlin: true })).toEqual(
      [],
    );
  });

  it('reports array, varargs and grouped lambda parameters, and skips nested and anonymous bodies', () => {
    const found = lines({
      Base: BASE,
      Child: `class Child extends Base {
  int total() { return size + count + label.length(); }
  int first(int[] size) { return size[0]; }
  String joined(String... label) { return label[0]; }
  void each(java.util.Map<String, Integer> m) { m.forEach((label, count) -> System.out.println(label + count)); }
  Object as() { int[] made = new int[3]; return (Base) (Object) this; }
  Runnable task() { return new Runnable() { public void run() { int size = 1; System.out.println(size); } }; }
  record Pair(int size, int count) {}
  ;
}`,
    });
    expect(found).toEqual([
      ['src/main/java/shop/Child.java', 4, 'size'],
      ['src/main/java/shop/Child.java', 5, 'label'],
      ['src/main/java/shop/Child.java', 6, 'label'],
      ['src/main/java/shop/Child.java', 6, 'count'],
    ]);
  });

  it('passes over a nested type without a body', () => {
    const found = lines({
      Base: BASE,
      Child: `class Child extends Base {
  int grow(int by) { int size = by; return size + this.size; }
  class Broken;
}`,
    });
    expect(found).toEqual([['src/main/java/shop/Child.java', 3, 'size']]);
  });

  it('reads nothing past either end of the tokens', () => {
    const source = parseSource('class A {}', { file: 'A.java', kotlin: false });
    const outside = [-1, source.tokens.length];

    expect(outside.map((index) => textAt(source, index))).toEqual(['', '']);
    expect(outside.map((index) => kindAt(source, index))).toEqual(['', '']);
    expect(outside.map((index) => lineAt(source, index, 9))).toEqual([9, 9]);
    expect(outside.map((index) => partnerAt(source, index))).toEqual([-1, -1]);
    expect(outside.map((index) => openerAt(source, index))).toEqual([-1, -1]);
  });
});
