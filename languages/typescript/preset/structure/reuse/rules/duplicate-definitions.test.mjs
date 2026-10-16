import { describe, expect, it } from 'vitest';
import {
  exceptionFor,
  rows,
  ruleFindings,
  source,
  usesTypes,
  usesValues,
  WORKSPACE_POLICY,
  workspaceFiles,
} from '../../test-support/reuse-project.mjs';

const duplicates = ruleFindings('duplicate-definition');

function withLimit(name, extra = '') {
  return `export const LIMIT = 5;\n${usesValues('LIMIT')}${extra}// ${name}\n`;
}

describe('duplicate-definition', () => {
  it('names every other copy of a used literal constant and the exception that lifts the rule', () => {
    const findings = duplicates({
      'src/main/audit/ids.ts': `export const ACCOUNT = 'system';\n${usesValues('ACCOUNT')}`,
      'src/main/billing/ids.ts': `// moved\nexport const ACCOUNT = "system";\n${usesValues('ACCOUNT')}`,
    });

    expect(findings.map(({ path, symbol, location }) => [path, symbol, location])).toEqual([
      ['src/main/audit/ids.ts', 'ACCOUNT', { line: 1 }],
      ['src/main/billing/ids.ts', 'ACCOUNT', { line: 2 }],
    ]);
    expect(findings[0].message).toBe(
      [
        'ACCOUNT is also defined with the same value in src/main/billing/ids.ts.',
        'Keep one definition and import it.',
        `If this is intended, add ${exceptionFor('duplicate-definition', findings[0].path)}`,
        'to "exceptions" in nitpicker.config.json.',
      ].join(' '),
    );
  });

  it('tells a private copy to move to one module, or to import the exported copy', () => {
    const twice = (head) => `${head}function twice(a: number) {\n  return a * 2;\n}\n`;
    const privateCopy = twice('') + usesValues('twice');
    const exportedCopy = twice('export ') + usesValues('twice');

    expect(
      duplicates({ 'src/a.ts': privateCopy, 'src/b.ts': privateCopy }).map(
        ({ message }) => message.split(' If this')[0],
      ),
    ).toEqual([
      'twice is also defined with the same code in src/b.ts. Move it to one module and import it.',
      'twice is also defined with the same code in src/a.ts. Move it to one module and import it.',
    ]);
    expect(
      duplicates({ 'src/a.ts': exportedCopy, 'src/b.ts': privateCopy }).map(
        ({ message }) => message.split(' If this')[0],
      ),
    ).toEqual([
      'twice is also defined with the same code in src/b.ts. Keep one definition and import it.',
      'twice is also defined with the same code in src/a.ts. Import it from src/a.ts instead.',
    ]);
  });

  it('reports one finding per copy with a stable identity, and lists at most three others', () => {
    const names = ['a', 'b', 'c', 'd', 'e'];
    const files = Object.fromEntries(names.map((name) => [`src/${name}.ts`, withLimit(name)]));
    const findings = duplicates(files);

    expect(rows(findings)).toEqual(
      names.map((name) => ['duplicate-definition', `src/${name}.ts`, 'duplicate:LIMIT']),
    );
    expect(findings[0].message).toMatch(
      /^LIMIT is also defined with the same value in src\/b\.ts, src\/c\.ts, src\/d\.ts and 1 more\./u,
    );
  });

  it('reports a const and a type with one name once per file', () => {
    const copy = source(
      "export const Status = 'on' as const;",
      "export type Status = 'on';",
      usesValues('Status') + usesTypes('Status'),
    );

    expect(rows(duplicates({ 'src/a.ts': copy, 'src/b.ts': copy }))).toEqual([
      ['duplicate-definition', 'src/a.ts', 'duplicate:Status'],
      ['duplicate-definition', 'src/b.ts', 'duplicate:Status'],
    ]);
  });

  it('leaves different values, non-literal initializers and different kinds alone', () => {
    expect(
      duplicates({
        'src/a.ts': source(
          'export const A = 1;',
          'export const B = compute(1);',
          'export const D = 1;',
          usesValues('A', 'B', 'D'),
        ),
        'src/b.ts': source(
          'export const A = 2;',
          'export const B = compute(1);',
          'export function D() { return 1; }',
          usesValues('A', 'B', 'D'),
        ),
      }),
    ).toEqual([]);
  });

  it('compares literal arrays and objects, with or without as const', () => {
    const use = usesValues('ROLES');

    expect(
      rows(
        duplicates({
          'src/a.ts': `export const ROLES = ['admin', 'user'] as const;\n${use}`,
          'src/b.ts': `export const ROLES = [\n  'admin',\n  'user',\n] as const;\n${use}`,
          'src/c.ts': `export const ROLES = ['admin'] as const;\n${use}`,
        }),
      ),
    ).toEqual([
      ['duplicate-definition', 'src/a.ts', 'duplicate:ROLES'],
      ['duplicate-definition', 'src/b.ts', 'duplicate:ROLES'],
    ]);
  });

  it('compares function declarations, function expressions and arrow functions by code', () => {
    const findings = duplicates({
      'src/a.ts': [
        'export function total(a: number) {\n  return a + 1;\n}',
        'export const double = (a: number) => a * 2;',
        'export const same = (a: number) => a;',
        usesValues('total', 'double', 'same'),
      ].join('\n'),
      'src/b.ts': [
        'export const total = function (a: number) { return a + 1; };',
        'export const double = (a: number) => a * 2;',
        'export const same = (a: number) => a + 0;',
        usesValues('total', 'double', 'same'),
      ].join('\n'),
    });

    expect(rows(findings).map(([, file, identity]) => [file, identity])).toEqual([
      ['src/a.ts', 'duplicate:double'],
      ['src/a.ts', 'duplicate:total'],
      ['src/b.ts', 'duplicate:double'],
      ['src/b.ts', 'duplicate:total'],
    ]);
    expect(findings[0].message).toMatch(
      /^double is also defined with the same code in src\/b\.ts\./u,
    );
  });

  it('includes overload signatures in the compared text', () => {
    const body = 'export function pick(a: unknown) {\n  return a;\n}\n';
    const use = usesValues('pick');

    expect(
      duplicates({
        'src/a.ts': `export function pick(a: string): string;\n${body}${use}`,
        'src/b.ts': `export function pick(a: number): number;\n${body}${use}`,
        'src/c.ts': `${body}${use}`,
      }),
    ).toEqual([]);
    expect(
      rows(
        duplicates({
          'src/a.ts': `export function pick(a: string): string;\n${body}${use}`,
          'src/b.ts': `export function pick(a: string): string;\n${body}${use}`,
        }),
      ),
    ).toHaveLength(2);
  });

  it('compares private functions, and types, interfaces and literal consts only when exported', () => {
    const copy = (exported) =>
      [
        `${exported}const LIMIT = 5;`,
        `${exported}function twice(a: number) { return a * 2; }`,
        `${exported}type Id = { value: string };`,
        `${exported}interface Props { title: string }`,
        usesValues('LIMIT', 'twice'),
        usesTypes('Id', 'Props'),
      ].join('\n');
    const identities = (files) =>
      rows(duplicates(files)).map(([, file, identity]) => `${file} ${identity}`);

    expect(identities({ 'src/a.ts': copy('export '), 'src/b.ts': copy('') })).toEqual([
      'src/a.ts duplicate:twice',
      'src/b.ts duplicate:twice',
    ]);
    expect(identities({ 'src/a.ts': copy(''), 'src/b.ts': copy('') })).toEqual([
      'src/a.ts duplicate:twice',
      'src/b.ts duplicate:twice',
    ]);
    expect(identities({ 'src/a.ts': copy('export '), 'src/b.ts': copy('export ') })).toEqual([
      'src/a.ts duplicate:Id',
      'src/a.ts duplicate:LIMIT',
      'src/a.ts duplicate:Props',
      'src/a.ts duplicate:twice',
      'src/b.ts duplicate:Id',
      'src/b.ts duplicate:LIMIT',
      'src/b.ts duplicate:Props',
      'src/b.ts duplicate:twice',
    ]);
  });

  it('keys an import that is no source file on its path from the importing file', () => {
    const title = source(
      "import styles from './styles.module.css';",
      'export function Title() {',
      '  return styles.title;',
      '}',
      usesValues('Title'),
    );

    expect(duplicates({ 'src/billing/title.ts': title, 'src/orders/title.ts': title })).toEqual([]);
    expect(
      rows(duplicates({ 'src/billing/title.ts': title, 'src/billing/heading.ts': title })),
    ).toEqual([
      ['duplicate-definition', 'src/billing/heading.ts', 'duplicate:Title'],
      ['duplicate-definition', 'src/billing/title.ts', 'duplicate:Title'],
    ]);
  });

  it('includes the type annotation of a const function in the compared text', () => {
    const handler = (type) =>
      source(
        `import type { ${type} } from './events';`,
        `export const handle: (event: ${type}) => string = (event) => event.name;`,
        usesValues('handle'),
      );

    expect(
      duplicates({
        'src/events.ts':
          'export type Billed = { name: string };\nexport type Paid = { name: string };\n',
        'src/a.ts': handler('Billed'),
        'src/b.ts': handler('Paid'),
      }),
    ).toEqual([]);
  });

  it('skips definitions nothing imports or references, such as framework conventions', () => {
    const route = "export const dynamic = 'force-dynamic';\nexport const revalidate = 60;\n";

    expect(
      duplicates({
        'src/app/a/route.ts': route,
        'src/app/b/route.ts': route,
        'src/app/a/loading.tsx': 'export default function Loading() {\n  return null;\n}\n',
        'src/app/b/loading.tsx': 'export default function Loading() {\n  return null;\n}\n',
      }),
    ).toEqual([]);
  });

  it('counts a definition another module imports, by name, default, namespace or dynamically', () => {
    const copy = (name) => `export const ${name} = 5;\n`;
    const defaulted = 'const THREE = 3;\nexport default THREE;\n';
    const files = {
      'src/a1.ts': copy('ONE'),
      'src/a2.ts': copy('ONE'),
      'src/b1.ts': copy('TWO'),
      'src/b2.ts': copy('TWO'),
      'src/c1.ts': defaulted,
      'src/c2.ts': defaulted,
      'src/d1.ts': copy('FOUR'),
      'src/d2.ts': copy('FOUR'),
      'src/use.ts': [
        "import { ONE } from './a1';",
        "import { ONE as ONE_AGAIN } from './a2';",
        "import * as one from './b1';",
        "import * as two from './b2';",
        "import three from './c1';",
        "import threeAgain from './c2';",
        "export const load = () => [import('./d1'), import('./d2')];",
        'export const all = [ONE, ONE_AGAIN, one, two, three, threeAgain];',
      ].join('\n'),
    };

    expect(rows(duplicates(files)).map(([, file]) => file)).toEqual([
      'src/a1.ts',
      'src/a2.ts',
      'src/b1.ts',
      'src/b2.ts',
      'src/c1.ts',
      'src/c2.ts',
      'src/d1.ts',
      'src/d2.ts',
    ]);
  });

  it('compares only the copies that are used', () => {
    expect(
      duplicates({
        'src/a.ts': 'export const ONE = 5;\n',
        'src/b.ts': 'export const ONE = 5;\n',
        'src/use.ts': "import { ONE } from './a';\nexport const all = [ONE];\n",
      }),
    ).toEqual([]);
  });

  it('skips definitions big enough for the duplicates analyzer', () => {
    const body = Array.from({ length: 12 }, (_, index) => `  total += input.value${index};`);
    const big = source(
      'export function sum(input: Record<string, number>) {',
      '  let total = 0;',
      ...body,
      '  return total;',
      '}',
      usesValues('sum'),
    );
    const small = `export function sum(input: number[]) {\n  return input.length;\n}\n${usesValues('sum')}`;

    expect(duplicates({ 'src/a.ts': big, 'src/b.ts': big })).toEqual([]);
    expect(duplicates({ 'src/a.ts': small, 'src/b.ts': small })).toHaveLength(2);
  });

  it('tells apart code that reads different imports or different local values', () => {
    const count = (head) =>
      `${head}export function count() {\n  return db.size;\n}\n${usesValues('count')}`;

    expect(
      duplicates({
        'src/a.ts': count("import { db } from './db-a';\n"),
        'src/b.ts': count("import { db } from './db-b';\n"),
        'src/db-a.ts': 'export const db = new Map();\n',
        'src/db-b.ts': 'export const db = new Set();\n',
      }),
    ).toEqual([]);
    expect(
      duplicates({
        'src/a.ts': count("import { db } from './db';\n"),
        'src/b.ts': count("import { db } from '../src/db';\n"),
        'src/db.ts': 'export const db = new Map();\n',
      }),
    ).toHaveLength(2);
    expect(
      duplicates({
        'src/a.ts': count('const db = new Map();\n'),
        'src/b.ts': count('const db = new Set();\n'),
      }),
    ).toEqual([]);
    expect(
      duplicates({
        'src/a.ts': count('const db = new Map();\n'),
        'src/b.ts': count('const db = new Map();\n'),
      }),
    ).toHaveLength(2);
  });

  it('ignores names a definition declares itself', () => {
    const shadow = (source) =>
      `import { item } from '${source}';\nexport function f(item: number) {\n  return item;\n}\n${usesValues('f')}`;

    expect(
      duplicates({
        'src/a.ts': shadow('./mod-a'),
        'src/b.ts': shadow('./mod-b'),
        'src/mod-a.ts': 'export const item = 1;\n',
        'src/mod-b.ts': 'export const item = 2;\n',
      }),
    ).toHaveLength(2);
  });

  it('skips generated files', () => {
    const generated = {
      'src/api.generated.ts': withLimit('a'),
      'src/schema.gen.ts': withLimit('b'),
      'src/__generated__/types.ts': withLimit('c'),
      'src/generated/client.ts': withLimit('d'),
    };

    expect(duplicates({ ...generated, 'src/ids.ts': withLimit('real') })).toEqual([]);
  });

  it('compares within one package of a monorepo and not across packages', () => {
    const manifest = JSON.stringify({ name: 'pkg' });
    const files = {
      'packages/a/package.json': manifest,
      'packages/b/package.json': manifest,
      'packages/a/src/one.ts': withLimit('1'),
      'packages/a/src/two.ts': withLimit('2'),
      'packages/b/src/one.ts': withLimit('3'),
    };
    const layout = { layout: { sourceRoots: ['packages'] } };

    expect(rows(duplicates(files, layout)).map(([, file]) => file)).toEqual([
      'packages/a/src/one.ts',
      'packages/a/src/two.ts',
    ]);
  });

  it('compares across source roots of one package, and keeps roots without a manifest apart', () => {
    const files = { 'core/a.ts': withLimit('1'), 'languages/b.ts': withLimit('2') };
    const policy = { layout: { sourceRoots: ['core', 'languages'] } };

    expect(duplicates(files, policy)).toEqual([]);
    expect(
      rows(duplicates({ ...files, 'package.json': '{}' }, policy)).map(([, file]) => file),
    ).toEqual(['core/a.ts', 'languages/b.ts']);
  });

  it('ignores re-exports, imports, tests and declaration files', () => {
    expect(
      duplicates({
        'src/a.ts': withLimit('a'),
        'src/b.ts': "export { LIMIT } from './a';\nimport { LIMIT as COPY } from './a';\n",
        'src/c.test.ts': withLimit('c'),
        'src/__tests__/d.ts': withLimit('d'),
        'src/e.d.ts': 'export declare const LIMIT = 5;\n',
        'test/f.ts': withLimit('f'),
      }),
    ).toEqual([]);
  });

  it('counts imports through a workspace package as use, and compares within that package', () => {
    const clamp = 'export function clamp(n: number) {\n  return Math.min(n, 10);\n}\n';
    const files = workspaceFiles({
      'packages/ui/src/a.ts': clamp,
      'packages/ui/src/b.ts': clamp,
      'packages/web/src/c.ts': clamp + usesValues('clamp'),
      'packages/web/src/page.ts': source(
        "import { clamp } from '@acme/ui/src/a';",
        "import { clamp as clampB } from '@acme/ui/src/b';",
        usesValues('clamp', 'clampB'),
      ),
    });

    expect(rows(duplicates(files, WORKSPACE_POLICY)).map(([, file]) => file)).toEqual([
      'packages/ui/src/a.ts',
      'packages/ui/src/b.ts',
    ]);
  });

  it('skips stories, mocks and fixtures', () => {
    expect(
      duplicates({
        'src/a.ts': withLimit('a'),
        'src/a.stories.ts': withLimit('story'),
        'src/b.story.tsx': withLimit('story'),
        'src/__mocks__/a.ts': withLimit('mock'),
        'src/__fixtures__/a.ts': withLimit('fixture'),
        'src/fixtures/a.ts': withLimit('fixture'),
        'src/stories/a.ts': withLimit('story'),
      }),
    ).toEqual([]);
  });

  it('is lifted for a file by an exception, which also ends the other copy finding', () => {
    const files = { 'src/a.ts': withLimit('a'), 'src/b.ts': withLimit('b') };
    const exceptions = [
      { rule: 'duplicate-definition', paths: ['src/a.ts'], reason: 'kept on purpose' },
    ];

    expect(duplicates(files, { exceptions })).toEqual([]);
    expect(
      duplicates(files, { exceptions: [{ ...exceptions[0], rule: 'new-icon-asset' }] }),
    ).toHaveLength(2);
  });
});
