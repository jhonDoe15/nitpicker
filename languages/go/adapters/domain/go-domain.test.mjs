import { describe, expect, it } from 'vitest';
import { exceptionHint } from '../../../../shared/rules/exceptions.mjs';
import { goDomainFindings } from './go-domain.mjs';

const MODULE = 'example.com/shop';
const ORDER = 'internal/orders/domain/order.go';

function file(path, extra = {}) {
  return { path, package: 'domain', test: false, generated: false, constrained: false, ...extra };
}

function usage(path, imports, selectors = []) {
  return {
    file: path,
    imports: imports.map((importPath, index) => ({ path: importPath, name: '', line: index + 3 })),
    names: [],
    selectors,
    local: [],
  };
}

function rows(findings) {
  return findings.map(({ rule, path, identity }) => `${rule} ${path} ${identity}`);
}

describe('domain rules on Go imports', () => {
  it('reports adapter packages, I/O, clients, loggers and random sources a domain file uses', () => {
    const report = {
      files: [file(ORDER)],
      usages: [
        usage(
          ORDER,
          [
            `${MODULE}/internal/orders/adapters/postgres`,
            'os',
            'database/sql',
            'log/slog',
            'math/rand/v2',
            'github.com/google/uuid',
          ],
          [
            { qualifier: 'postgres', name: 'Store' },
            { qualifier: 'os', name: 'ReadFile' },
            { qualifier: 'sql', name: 'DB' },
            { qualifier: 'slog', name: 'Info' },
            { qualifier: 'rand', name: 'IntN' },
            { qualifier: 'uuid', name: 'NewString' },
            { qualifier: 'uuid', name: 'UUID' },
          ],
        ),
      ],
    };

    const findings = goDomainFindings(report, MODULE);

    expect(rows(findings)).toEqual([
      `domain-imports-adapter ${ORDER} domain-adapter:${MODULE}/internal/orders/adapters/postgres`,
      `domain-imports-io ${ORDER} library:os`,
      `domain-imports-client ${ORDER} library:database/sql`,
      `domain-imports-logger ${ORDER} library:log/slog`,
      `domain-imports-random ${ORDER} library:math/rand/v2`,
      `domain-imports-random ${ORDER} library:github.com/google/uuid`,
    ]);
    expect(findings.at(-1).message).toBe(
      `Pass ids and random values into order.go: it uses uuid.NewString (github.com/google/uuid). Take them as parameters, or through an id or random source port the domain declares and an adapter implements. ${exceptionHint('coupling/domain-imports-random', ORDER)}`,
    );
  });

  it('leaves values, project packages, tests, generated files and code outside the domain alone', () => {
    const imports = ['github.com/google/uuid', 'net/url', 'time', `${MODULE}/internal/money`, 'os'];
    const selectors = [
      { qualifier: 'uuid', name: 'Parse' },
      { qualifier: 'url', name: 'Parse' },
    ];
    const outside = 'internal/orders/adapters/domain_mapper.go';
    const report = {
      files: [
        file(ORDER),
        file('internal/orders/domain/order_test.go', { test: true }),
        file('internal/orders/domain/order_gen.go', { generated: true }),
        file('internal/orders/infra/domain/store.go'),
        file(outside),
      ],
      usages: [
        usage(ORDER, imports.slice(0, 4), selectors),
        usage('internal/orders/domain/order_test.go', ['os']),
        usage('internal/orders/domain/order_gen.go', ['os']),
        usage('internal/orders/infra/domain/store.go', ['os']),
        usage(outside, ['os']),
      ],
    };

    expect(goDomainFindings(report, MODULE)).toEqual([]);
  });

  it('reads the package name of versioned and renamed paths and leaves value types alone', () => {
    const imports = [
      'github.com/oklog/ulid/v2',
      'github.com/satori/go.uuid',
      'net',
      'database/sql',
      'math/rand/v2',
    ];
    const selectors = [
      { qualifier: 'ulid', name: 'Make' },
      { qualifier: 'uuid', name: 'NewV4' },
      { qualifier: 'net', name: 'ParseIP' },
      { qualifier: 'sql', name: 'ErrNoRows' },
      { qualifier: 'rand', name: 'IntN' },
    ];
    const report = { files: [file(ORDER)], usages: [usage(ORDER, imports, selectors)] };

    const findings = goDomainFindings(report, MODULE);

    expect(rows(findings)).toEqual([
      `domain-imports-random ${ORDER} library:github.com/oklog/ulid/v2`,
      `domain-imports-random ${ORDER} library:github.com/satori/go.uuid`,
      `domain-imports-random ${ORDER} library:math/rand/v2`,
    ]);
    expect(findings.at(-1).message).toBe(
      `Pass ids and random values into order.go: it uses rand.IntN (math/rand/v2). Take them as parameters, or through an id or random source port the domain declares and an adapter implements. ${exceptionHint('coupling/domain-imports-random', ORDER)}`,
    );
    const named = usage(
      ORDER,
      ['github.com/google/uuid'],
      [{ qualifier: 'uuid', name: 'NewSHA1' }],
    );
    expect(goDomainFindings({ files: [file(ORDER)], usages: [named] }, MODULE)).toEqual([]);
  });
});
