import { describe, expect, it } from 'vitest';
import { PROJECT, useTempProjects } from '../test-support/temp-projects.mts';
import {
  DELEGATE_SKIPS_DEFAULT_RULE,
  readDelegateSkipsDefaultFindings,
} from './delegate-skips-default.mts';

const projectWith = useTempProjects('nitpicker-delegate-default-');

function scan(files: Readonly<Record<string, string>>) {
  const sources = Object.fromEntries(
    Object.entries(files).map(([name, text]) => [
      `src/main/java/shop/${name}.java`,
      text.startsWith('package') ? `${text}\n` : `package shop;\n${text}\n`,
    ]),
  );
  return readDelegateSkipsDefaultFindings(projectWith(sources), {
    projects: [PROJECT],
    kotlin: false,
  });
}

const INPUT = `public interface Input {
  void readFully(long position, byte[] buffer) throws java.io.IOException;
  int length();
  default Object getMetrics() { return null; }
  default boolean isAsync() { return false; }
  default int total() { return length() * 2; }
  static Input empty() { return null; }
}`;

function wrapper(body: string, header = 'class Tracking implements Input') {
  return `${header} {
  private final Input delegate;
  @Override public void readFully(long position, byte[] buffer) throws java.io.IOException {
    delegate.readFully(position, buffer);
  }
  @Override public int length() { return delegate.length(); }
${body}
}`;
}

describe('DelegateSkipsDefaultMethod', () => {
  it('reports a wrapper that forwards the abstract methods but skips two defaults', () => {
    const found = scan({ Input: INPUT, Tracking: wrapper('') });
    expect(found.map(({ rule, path, location }) => [rule, path, location.line])).toEqual([
      [DELEGATE_SKIPS_DEFAULT_RULE, 'src/main/java/shop/Tracking.java', 2],
    ]);
    expect(found[0]?.message).toBe(
      'This wrapper forwards `Input` methods to `delegate` but not the default methods ' +
        '`getMetrics()`, `isAsync()`, so those calls run the default and never reach the ' +
        'delegate; forward them, or override one calling `Input.super.<method>()` to keep the ' +
        'default. If this is intended, add {"rule":"pmd/DelegateSkipsDefaultMethod","paths":' +
        '["src/main/java/shop/Tracking.java"],"reason":"..."} to "exceptions" in ' +
        'nitpicker.config.json.',
    );
  });

  it('reports a default of a super-interface and an expression statement forward', () => {
    const found = scan({
      Base: 'interface Base { default boolean ready() { return true; } }',
      Input: 'interface Input extends Base { void close(); void open(); }',
      Closing: `class Closing implements Input {
  private final Input inner;
  public void close() { this.inner.close(); }
  public void open() { inner.open(); }
}`,
    });
    expect(found.map(({ message }) => /`ready\(\)`/u.test(message))).toEqual([true]);
  });

  it('reports a generic listener wrapper with a boolean capability default', () => {
    const found = scan({
      Listener: `public interface Listener<K, V> {
  void onMessage(java.util.Map<K, V> data, String topic);
  void onIdle(long time);
  default boolean isAsyncReplies() { return false; }
}`,
      Adapter: `public class Adapter<K, V> implements Listener<K, V> {
  private final Listener<K, V> delegate;
  public Adapter(Listener<K, V> delegate) { this.delegate = delegate; }
  @Override
  public void onMessage(java.util.Map<K, V> data, String topic) { this.delegate.onMessage(data, topic); }
  @Override
  public void onIdle(long time) { this.delegate.onIdle(time); }
}`,
    });
    expect(found.map(({ message }) => /`isAsyncReplies\(\)`/u.test(message))).toEqual([true]);
  });

  it('accepts a wrapper that forwards every default or keeps one on purpose', () => {
    const forwarded = wrapper(
      `  @Override public Object getMetrics() { return delegate.getMetrics(); }
  @Override public boolean isAsync() { return delegate.isAsync(); }`,
    );
    const kept = wrapper(
      `  @Override public Object getMetrics() { return delegate.getMetrics(); }
  @Override public boolean isAsync() { return Input.super.isAsync(); }`,
    );
    expect(scan({ Input: INPUT, Tracking: forwarded })).toEqual([]);
    expect(scan({ Input: INPUT, Tracking: kept })).toEqual([]);
  });

  it('accepts defaults inherited from a project superclass', () => {
    const found = scan({
      Input: INPUT,
      Base: `abstract class Base {
  public Object getMetrics() { return null; }
  public boolean isAsync() { return true; }
}`,
      Tracking: wrapper('', 'class Tracking extends Base implements Input'),
    });
    expect(found).toEqual([]);
  });

  it('accepts a default that is built from the forwarded methods', () => {
    const found = scan({
      Input: `interface Input {
  int length();
  void close();
  default int total() { return length() * 2; }
}`,
      Tracking: `class Tracking implements Input {
  private final Input delegate;
  public int length() { return delegate.length(); }
  public void close() { delegate.close(); }
}`,
    });
    expect(found).toEqual([]);
  });

  it('accepts defaults that depend on this or on their arguments', () => {
    const found = scan({
      Input: `interface Input {
  int length();
  void close();
  default Input self() { return this; }
  default boolean covers(int at) { return at < 10; }
  default Object describe() { return String.valueOf(this); }
}`,
      Tracking: `class Tracking implements Input {
  private final Input delegate;
  public int length() { return delegate.length(); }
  public void close() { delegate.close(); }
}`,
    });
    expect(found).toEqual([]);
  });

  it('accepts a default that a sub-interface rebuilds from other methods', () => {
    const found = scan({
      Base: 'interface Base { int size(); void close(); default Object schema() { return null; } }',
      Input: 'interface Input extends Base { default Object schema() { return build(size()); } }',
      Tracking: `class Tracking implements Input {
  private final Input delegate;
  public int size() { return delegate.size(); }
  public void close() { delegate.close(); }
}`,
    });
    expect(found).toEqual([]);
  });

  it('accepts a wrapper that leaves many defaults on purpose', () => {
    const defaults = ['a', 'b', 'c', 'd']
      .map((name) => `  default boolean ${name}() { return false; }`)
      .join('\n');
    const found = scan({
      Input: `interface Input {\n  void close();\n  void open();\n${defaults}\n}`,
      Tracking: `class Tracking implements Input {
  private final Input delegate;
  public void close() { delegate.close(); }
  public void open() { delegate.open(); }
}`,
    });
    expect(found).toEqual([]);
  });

  it('accepts an abstract wrapper whose project subclass declares the default', () => {
    const found = scan({
      Input: INPUT,
      Tracking: wrapper('', 'abstract class Tracking implements Input'),
      Counting: `class Counting extends Tracking {
  public Object getMetrics() { return 1; }
  public boolean isAsync() { return true; }
}`,
    });
    expect(found).toEqual([]);
  });

  it('reports an abstract wrapper that no subclass completes', () => {
    const found = scan({
      Input: INPUT,
      Tracking: wrapper('', 'abstract class Tracking implements Input'),
    });
    expect(found.map(({ symbol }) => symbol)).toEqual(['Tracking']);
  });

  it('ignores a class with a superclass outside the project', () => {
    const found = scan({
      Input: INPUT,
      Tracking: wrapper('', 'class Tracking extends java.io.FilterInputStream implements Input'),
    });
    expect(found).toEqual([]);
  });

  it('ignores a delegate field generated by Lombok', () => {
    const found = scan({
      Input: INPUT,
      Tracking: wrapper('').replace(
        'private final Input delegate',
        '@lombok.experimental.Delegate private final Input delegate',
      ),
    });
    expect(found).toEqual([]);
  });

  it('does not resolve a same-named interface of another package without an import', () => {
    const found = scan({
      'other/Input':
        'package other;\npublic interface Input { void a(); void b(); default Object m() { return null; } }',
      Tracking: `class Tracking implements Input {
  private final Input delegate;
  public void a() { delegate.a(); }
  public void b() { delegate.b(); }
}`,
    });
    expect(found).toEqual([]);
  });

  it('resolves an interface of another package through a wildcard import', () => {
    const found = scan({
      'other/Input':
        'package other;\npublic interface Input { void a(); void b(); default Object m() { return null; } }',
      Tracking: `import other.*;
class Tracking implements Input {
  private final Input delegate;
  public void a() { delegate.a(); }
  public void b() { delegate.b(); }
}`,
    });
    expect(found).toHaveLength(1);
  });

  it('tells overloads apart by the types of their parameters', () => {
    const found = scan({
      Input: `interface Input {
  void a(int x);
  void b(int x);
  default Object m(String s) { return null; }
}`,
      Tracking: `class Tracking implements Input {
  private final Input delegate;
  public void a(int x) { delegate.a(x); }
  public void b(int x) { delegate.b(x); }
  public Object m(int s) { return null; }
}`,
    });
    expect(found).toHaveLength(1);
  });

  it('finds the delegate in a project superclass', () => {
    const found = scan({
      Input: INPUT,
      Base: `abstract class Base {
  protected final Input delegate;
  Base(Input delegate) { this.delegate = delegate; }
}`,
      Tracking: `class Tracking extends Base implements Input {
  Tracking(Input delegate) { super(delegate); }
  public void readFully(long position, byte[] buffer) throws java.io.IOException {
    delegate.readFully(position, buffer);
  }
  public int length() { return delegate.length(); }
}`,
    });
    expect(found.map(({ symbol }) => symbol)).toEqual(['Tracking']);
  });

  it('counts a forward inside a synchronized block', () => {
    const found = scan({
      Input: INPUT,
      Tracking: wrapper('').replace(
        'public int length() { return delegate.length(); }',
        'public int length() { synchronized (this) { return delegate.length(); } }',
      ),
    });
    expect(found).toHaveLength(1);
  });

  it('accepts classes that do not mostly forward', () => {
    const logging = wrapper('').replace(
      'delegate.readFully(position, buffer);',
      'System.out.println(position);\n    delegate.readFully(position, buffer);',
    );
    const single = `class Tracking implements Input {
  private final Input delegate;
  public int length() { return delegate.length(); }
  public void readFully(long position, byte[] buffer) { read(position); }
  public void other() { }
}`;
    expect(scan({ Input: INPUT, Tracking: logging })).toEqual([]);
    expect(scan({ Input: INPUT, Tracking: single })).toEqual([]);
  });

  it('ignores a field of another type and an interface from a library', () => {
    const other = `class Tracking implements Input {
  private final Object delegate;
  public void readFully(long position, byte[] buffer) { }
  public int length() { return 0; }
}`;
    const library = `class Names implements java.util.function.Supplier<String> {
  private final java.util.function.Supplier<String> delegate;
  public String get() { return delegate.get(); }
}`;
    expect(scan({ Input: INPUT, Tracking: other })).toEqual([]);
    expect(scan({ Library: library })).toEqual([]);
  });

  it('does not resolve a same-named type from an import that is not in the project', () => {
    const found = scan({
      Input: INPUT,
      Tracking: `import other.Input;\n${wrapper('')}`,
    });
    expect(found).toEqual([]);
  });
});
