import { describe, expect, it } from 'vitest';
import {
  exceptionFor,
  rows,
  ruleFindings,
  source,
  WORKSPACE_POLICY,
  workspaceFiles,
} from '../../test-support/reuse-project.mjs';

const collisions = ruleFindings('exported-name-collision');

const tsconfig = JSON.stringify({
  compilerOptions: {
    types: [],
    lib: ['ES2022'],
    baseUrl: '.',
    paths: { '@app/*': ['src/main/*'] },
  },
});

const shared = 'export function getFilters(a: number, b: number) { return a + b; }\n';
const orders = 'export function getFilters(a: number) { return a; }\n';

describe('exported-name-collision', () => {
  it('reports each defining module when a module imports both and keeps the name for one', () => {
    const importer = 'src/main/features/orders/adapters/table.tsx';
    const findings = collisions({
      'src/main/shared/filters.ts': shared,
      'src/main/features/orders/adapters/filters.ts': orders,
      [importer]: source(
        "import { getFilters } from '../../../shared/filters';",
        "import { getFilters as orderFilters } from './filters';",
      ),
    });

    expect(findings.map(({ path, symbol, location }) => [path, symbol, location])).toEqual([
      ['src/main/features/orders/adapters/filters.ts', 'getFilters', { line: 1 }],
      ['src/main/shared/filters.ts', 'getFilters', { line: 1 }],
    ]);
    expect(findings[1].message).toBe(
      [
        'getFilters is also exported by src/main/features/orders/adapters/filters.ts;',
        `${importer} imports both. Rename one, or alias both imports.`,
        `If this is intended, add ${exceptionFor('exported-name-collision', findings[1].path)}`,
        'to "exceptions" in nitpicker.config.json.',
      ].join(' '),
    );
  });

  it('reports nothing when every colliding import is aliased', () => {
    expect(
      collisions({
        'src/a.ts': shared,
        'src/b.ts': orders,
        'src/c.ts':
          "import { getFilters as sharedFilters } from './a';\nimport { getFilters as orderFilters } from './b';\n",
        'src/d.ts': source(
          "import type { getFilters as typedShared } from './a';",
          "import { type getFilters as typedOrder } from './b';",
        ),
      }),
    ).toEqual([]);
  });

  it('treats a module that exports its definition under another name as no collision', () => {
    expect(
      collisions({
        'src/a.ts': 'function handler(a: number) { return a; }\nexport { handler as getUser };\n',
        'src/b.ts': 'export function handler(a: string) { return a; }\n',
        'src/c.ts': "import { getUser } from './a';\nimport { handler } from './b';\n",
      }),
    ).toEqual([]);
  });

  it('needs one module to import both: separate importers are not a collision', () => {
    expect(
      collisions({
        'src/a.ts': shared,
        'src/b.ts': orders,
        'src/c.ts': "import { getFilters } from './a';\n",
        'src/d.ts': "import { getFilters } from './b';\n",
      }),
    ).toEqual([]);
  });

  it('leaves identical definitions to duplicate-definition', () => {
    expect(
      collisions({
        'src/a.ts': orders,
        'src/b.ts': `// copy\n${orders}`,
        'src/c.ts':
          "import { getFilters } from './a';\nimport { getFilters as copy } from './b';\n",
      }),
    ).toEqual([]);
  });

  it('resolves a re-exporting index to the module that defines the name', () => {
    const files = {
      'src/main/shared/filters.ts': shared,
      'src/main/features/orders/filters.ts': orders,
      'src/main/features/orders/index.ts': "export { getFilters } from './filters';\n",
      'src/main/features/orders/barrel.ts': "export * from './index';\n",
      'src/main/ui.ts': source(
        "import { getFilters } from '@app/shared/filters';",
        "import { getFilters as fromIndex } from '@app/features/orders';",
        "import { getFilters as fromBarrel } from '@app/features/orders/barrel';",
      ),
      'tsconfig.json': tsconfig,
    };

    expect(rows(collisions(files))).toEqual([
      ['exported-name-collision', 'src/main/features/orders/filters.ts', 'collision:getFilters'],
      ['exported-name-collision', 'src/main/shared/filters.ts', 'collision:getFilters'],
    ]);
  });

  it('does not report the same definition imported through its index and directly', () => {
    expect(
      collisions({
        'src/main/features/orders/filters.ts': orders,
        'src/main/features/orders/index.ts': "export { getFilters } from './filters';\n",
        'src/main/ui.ts': source(
          "import { getFilters } from './features/orders';",
          "import { getFilters as direct } from './features/orders/filters';",
        ),
      }),
    ).toEqual([]);
  });

  it('follows renaming re-exports and imports that are exported again', () => {
    expect(
      rows(
        collisions({
          'src/a.ts': 'export const find = (a: number) => a;\n',
          'src/b.ts': "import { find } from './a';\nexport { find as search };\n",
          'src/c.ts': 'export const search = (a: string) => a;\n',
          'src/d.ts': "import { search } from './b';\nimport { search as other } from './c';\n",
        }),
      ),
    ).toEqual([
      ['exported-name-collision', 'src/a.ts', 'collision:search'],
      ['exported-name-collision', 'src/c.ts', 'collision:search'],
    ]);
  });

  it('follows a workspace package to its source', () => {
    const files = workspaceFiles({
      'packages/ui/src/index.ts': 'export const Foo = 1;\n',
      'packages/web/src/foo.ts': 'export const Foo = 2;\n',
      'packages/web/src/page.ts': source(
        "import { Foo } from '@acme/ui';",
        "import { Foo as LocalFoo } from './foo';",
        'void [Foo, LocalFoo];',
      ),
    });

    expect(rows(collisions(files, WORKSPACE_POLICY))).toEqual([
      ['exported-name-collision', 'packages/ui/src/index.ts', 'collision:Foo'],
      ['exported-name-collision', 'packages/web/src/foo.ts', 'collision:Foo'],
    ]);
  });

  it('counts type imports, ignores packages and unexported declarations, and honours exceptions', () => {
    const files = {
      'src/a.ts': 'export type Filters = { a: number };\n',
      'src/b.ts': 'export type Filters = { b: number };\n',
      'src/c.ts':
        "import type { Filters } from './a';\nimport { type Filters as Other } from './b';\n",
      'src/d.ts': 'type Hidden = number;\nexport type Visible = string;\n',
      'src/e.ts':
        "import { Filters } from 'some-package';\nimport { Filters as Mine } from './a';\n",
    };

    expect(rows(collisions(files))).toEqual([
      ['exported-name-collision', 'src/a.ts', 'collision:Filters'],
      ['exported-name-collision', 'src/b.ts', 'collision:Filters'],
    ]);
    expect(
      collisions(files, {
        exceptions: [{ rule: 'exported-name-collision', paths: ['src/a.ts'], reason: 'kept' }],
      }),
    ).toEqual([]);
  });
});
