import { describe, expect, it } from 'vitest';
import { createResolver, parseImport } from './kotlin-names.mjs';

const SERVICE = new Set(['org.springframework.stereotype.Service']);

function resolverOf(imports, packageName = 'demo') {
  return createResolver({
    imports: imports.map((text) => ({
      name: undefined,
      path: undefined,
      star: undefined,
      ...parseImport(text),
    })),
    packageName,
  });
}

describe('Kotlin import parsing', () => {
  it('reads a plain import, an alias, a wildcard and backticked segments', () => {
    expect(
      [
        'import org.springframework.stereotype.Service',
        'import org.springframework.data.jpa.repository.Query as Q',
        'import jakarta.persistence.*',
        'import demo.`in`.Thing',
      ].map(parseImport),
    ).toEqual([
      { path: 'org.springframework.stereotype.Service', name: 'Service' },
      { path: 'org.springframework.data.jpa.repository.Query', name: 'Q' },
      { star: 'jakarta.persistence' },
      { path: 'demo.in.Thing', name: 'Thing' },
    ]);
  });

  it('ignores text that is not an import', () => {
    expect(parseImport('package demo')).toBeUndefined();
  });
});

describe('Kotlin name resolution', () => {
  it('matches a name through an explicit import, a wildcard import, an alias and a qualified name', () => {
    expect([
      resolverOf(['import org.springframework.stereotype.Service']).matches('Service', SERVICE),
      resolverOf(['import org.springframework.stereotype.*']).matches('Service', SERVICE),
      resolverOf(['import org.springframework.stereotype.Service as Svc']).matches('Svc', SERVICE),
      resolverOf([]).matches('org.springframework.stereotype.Service', SERVICE),
    ]).toEqual([true, true, true, true]);
  });

  it('does not match a name that another import claims or that was never imported', () => {
    expect([
      resolverOf(['import other.Service', 'import org.springframework.stereotype.*']).matches(
        'Service',
        SERVICE,
      ),
      resolverOf([]).matches('Service', SERVICE),
      resolverOf(['import org.springframework.stereotype.Service as Svc']).matches(
        'Service',
        SERVICE,
      ),
    ]).toEqual([false, false, false]);
  });

  it('lists the candidates of a simple name: wildcard packages, the own package and the default imports', () => {
    expect(resolverOf(['import jakarta.persistence.*'], 'demo.app').candidates('Entity')).toEqual([
      'demo.app.Entity',
      'jakarta.persistence.Entity',
      'kotlin.Entity',
      'kotlin.annotation.Entity',
      'kotlin.collections.Entity',
      'kotlin.comparisons.Entity',
      'kotlin.io.Entity',
      'kotlin.ranges.Entity',
      'kotlin.sequences.Entity',
      'kotlin.text.Entity',
      'kotlin.jvm.Entity',
      'java.lang.Entity',
    ]);
  });

  it('resolves the head of a nested name through its import', () => {
    expect(resolverOf(['import jakarta.persistence.FetchType']).fullName('FetchType.LAZY')).toBe(
      'jakarta.persistence.FetchType.LAZY',
    );
  });
});
