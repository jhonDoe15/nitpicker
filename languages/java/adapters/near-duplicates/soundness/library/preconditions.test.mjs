import { beforeAll, describe, expect, it } from 'vitest';
import { KOTLIN_FILE, decidedRunner, inClass } from '../../test-support/decided-runner.mjs';

let decided;

beforeAll(async () => {
  decided = await decidedRunner();
});

function withImports(imports, ...lines) {
  return [...imports.map((name) => `import ${name};`), inClass(...lines)].join('\n');
}

describe('decided-condition on library precondition calls', () => {
  it.each([
    {
      name: 'commons-lang Validate',
      imported: 'org.apache.commons.lang3.Validate',
      notNull: 'Validate.notNull(o);',
      isTrue: 'Validate.isTrue(n > 0, "n");',
    },
    {
      name: 'Guava Preconditions',
      imported: 'com.google.common.base.Preconditions',
      notNull: 'Preconditions.checkNotNull(o);',
      isTrue: 'Preconditions.checkState(n > 0);',
    },
    {
      name: 'Spring Assert',
      imported: 'org.springframework.util.Assert',
      notNull: 'Assert.notNull(o, "o");',
      isTrue: 'Assert.state(n > 0, "n");',
    },
  ])('reads $name as a guard', ({ imported, notNull, isTrue }) => {
    const text = withImports(
      [imported],
      '  int f(Object o, int n) {',
      `    ${notNull}`,
      '    if (o == null) { return 1; }',
      `    ${isTrue}`,
      '    if (n <= 0) { return 2; }',
      '    return 0;',
      '  }',
    );

    expect(decided(text)).toEqual([
      '5: `o == null` is always false here: line 4 throws unless `o != null`, so the code it guards never runs',
      '7: `n <= 0` is always false here: line 6 throws unless `n > 0`, so the code it guards never runs',
    ]);
  });

  it('does not read a project method named like a library precondition as one', () => {
    const text = inClass(
      '  void checkNotNull(Object o) { }',
      '  int f(Object o) { checkNotNull(o); if (o == null) { return 1; } return 0; }',
    );

    expect(decided(text)).toEqual([]);
  });
});

describe('decided-condition on Kotlin precondition calls', () => {
  it('reads checkNotNull as a guard', () => {
    const text = 'fun f(o: Any?): Int { checkNotNull(o); if (o == null) { return 1 }; return 0 }';

    expect(decided(text, KOTLIN_FILE)).toEqual([
      '1: `o == null` is always false here: line 1 throws unless `o != null`, so the code it guards never runs',
    ]);
  });
});
