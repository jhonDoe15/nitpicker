import { describe, expect, it } from 'vitest';
import { sourceRunners } from '../test-support/source-runners.mts';
import { findMismatchedPreconditions as untypedFind } from './precondition-messages.mjs';

const find: (source: unknown) => { readonly named: string }[] = untypedFind;

const { java, kotlin } = sourceRunners({
  find,
  pick: ({ named }) => named,
  java: {
    file: 'Cache.java',
    wrap: (members) =>
      `import org.springframework.util.Assert;\nclass Cache {\n  private String region;\n${members}\n}\n`,
  },
  kotlin: {
    file: 'Cache.kt',
    wrap: (members) => `class Cache(val region: String) {\n${members}\n}\n`,
  },
});

describe('PreconditionMessageNamesOtherValue in Java', () => {
  it('reports a check whose message names another value in scope', () => {
    expect(
      java(
        'void set(String name, Long ttl, String unit) { Assert.notNull(ttl, "unit must not be null"); }',
      ),
    ).toEqual(['unit']);
    expect(
      java(
        'void set(String name, Long ttl, TimeUnit timeUnit) { Assert.notNull(ttl, "TimeUnit must not be null"); }',
      ),
    ).toEqual(['timeUnit']);
    expect(
      java(
        'void set(String name, String value) { Objects.requireNonNull(value, "name is required"); }',
      ),
    ).toEqual(['name']);
    expect(
      java('void set(String name, int count) { checkState(count >= 0, "name is negative"); }'),
    ).toEqual(['name']);
    expect(
      java(
        'record Pair(String name, String value) { Pair { Assert.notNull(value, "name must not be null"); } }',
      ),
    ).toEqual(['name']);
  });

  it('allows a message that names the checked value or a concept', () => {
    expect(
      java('void set(String name) { Assert.notNull(name, "name must not be null"); }'),
    ).toEqual([]);
    expect(
      java('void set(String name) { Assert.notNull(name, "Name must not be null"); }'),
    ).toEqual([]);
    expect(
      java('void set(Cmd c) { Assert.isTrue(c.getCount() > 0, "count must be positive"); }'),
    ).toEqual([]);
    expect(
      java('void set(String name) { Assert.notNull(name, "Cache name must not be null"); }'),
    ).toEqual([]);
    expect(
      java('void set(String name) { Assert.notNull(name, "value must not be null"); }'),
    ).toEqual([]);
    expect(java('void set(String name) { Assert.notNull(name); }')).toEqual([]);
    expect(java('void set(String name, int n) { Assert.isTrue(n > 0, "name " + name); }')).toEqual(
      [],
    );
    expect(
      java(
        'void set(List<String> names, String n) { Assert.hasText(n, "names must not contain blanks"); }',
      ),
    ).toEqual([]);
    expect(
      java(
        'void set(String targetTimeUnit, String unit) { Assert.notNull(targetTimeUnit, "TimeUnit must not be null"); }',
      ),
    ).toEqual([]);
    expect(
      java(
        'void set(Object other) { Assert.notNull(other.getRegion(), "region must not be null"); }',
      ),
    ).toEqual([]);
    expect(
      java(
        'void set(Object lookupKey) { if (lookupKey instanceof String ' +
          'constantName) { Assert.notNull(constantName, "lookupKey must ' +
          'not be null"); } }',
      ),
    ).toEqual([]);
    expect(
      java(
        'void set(byte[] delimiter) { int length = delimiter.length; ' +
          'Assert.isTrue(length > 0, "delimiter must not be empty"); }',
      ),
    ).toEqual([]);
    expect(
      java(
        'void set(Class<?> targetType, Object target) { Assert.notNull(target, "targetType and target must be set"); }',
      ),
    ).toEqual([]);
    expect(
      java('void set(String name) { Assert.notNull(name, "useThing must not be null"); }'),
    ).toEqual([]);
  });
});

describe('PreconditionMessageNamesOtherValue in Kotlin', () => {
  it('reports the same shape', () => {
    expect(
      kotlin(
        'fun set(name: String, ttl: Long?) { requireNotNull(ttl) { "name must not be null" } }',
      ),
    ).toEqual(['name']);
    expect(
      kotlin(
        'fun set(name: String, ttl: Long?) { requireNotNull(ttl) { "ttl must not be null" } }',
      ),
    ).toEqual([]);
  });
});
