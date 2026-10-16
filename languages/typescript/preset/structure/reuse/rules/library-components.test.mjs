import { describe, expect, it } from 'vitest';
import {
  exceptionFor,
  findingsOf,
  reactFiles,
  rows,
  ruleFindings,
  source,
  WORKSPACE_POLICY,
  workspaceFiles,
} from '../../test-support/reuse-project.mjs';

const findingsFor = ruleFindings('redefined-library-component');
const redefined = (files, policy, dependencies) =>
  findingsFor(reactFiles(files, dependencies), policy);

const usesCard = (name) =>
  `import { Card } from '@acme/ui';\nexport const ${name} = () => <Card />;\n`;
const ownCard = 'export function Card() {\n  return <div />;\n}\n';

describe('redefined-library-component', () => {
  it('reports a component named like one rendered from a dependency, with the number of files', () => {
    const findings = redefined({
      'src/a.tsx': usesCard('A'),
      'src/b.tsx': usesCard('B'),
      'src/card.tsx': ownCard,
    });

    expect(findings.map(({ path, symbol, location }) => [path, symbol, location])).toEqual([
      ['src/card.tsx', 'Card', { line: 1 }],
    ]);
    expect(findings[0].message).toBe(
      [
        'Card is already rendered from @acme/ui in 2 files. Use that one.',
        `If a reviewer agrees this is intended, add ${exceptionFor('redefined-library-component', 'src/card.tsx')}`,
        'to "exceptions" in nitpicker.config.json.',
      ].join(' '),
    );
  });

  it('says "1 file" for a single importer and names the package used by most files', () => {
    const kit = "import { Card } from '@other/kit';\nexport const X = () => <Card />;\n";
    const files = {
      'src/a.tsx': usesCard('A'),
      'src/b.tsx': kit.replace('X', 'B'),
      'src/c.tsx': kit.replace('X', 'C'),
      'src/card.tsx': ownCard,
    };
    const dependencies = { '@acme/ui': '1', '@other/kit': '1' };

    expect(redefined(files, {}, dependencies)[0].message).toMatch(
      /^Card is already rendered from @other\/kit in 2 files\./u,
    );
    expect(redefined({ 'src/a.tsx': usesCard('A'), 'src/card.tsx': ownCard })[0].message).toMatch(
      /^Card is already rendered from @acme\/ui in 1 file\./u,
    );
  });

  it('counts a name only when the project renders it as a JSX element', () => {
    const files = {
      'src/a.tsx': source(
        "import { Card, Table, Request } from '@acme/ui';",
        'const rows = Table.create(Request);',
        'export const A = [Card, rows];',
      ),
      'src/card.tsx': ownCard,
      'src/table.tsx': 'export const Table = () => <table />;\n',
      'src/request.tsx': 'export const Request = () => <div />;\n',
    };

    expect(redefined(files)).toEqual([]);
    expect(
      rows(redefined({ ...files, 'src/b.tsx': usesCard('B') })).map(([, file]) => file),
    ).toEqual(['src/card.tsx']);
  });

  it('counts a named import rendered under an alias, but not a namespace member', () => {
    const files = {
      'src/a.tsx':
        "import { Card as UiCard } from '@acme/ui';\nexport const A = () => <UiCard />;\n",
      'src/b.tsx': "import * as Tabs from '@acme/ui';\nexport const B = () => <Tabs.List />;\n",
      'src/card.tsx': ownCard,
      'src/list.tsx': 'export const List = () => <ul />;\n',
    };

    expect(rows(redefined(files)).map(([, file]) => file)).toEqual(['src/card.tsx']);
  });

  it('does not count icons from an icon package', () => {
    const files = {
      'src/nav.tsx':
        "import { Search } from 'lucide-react';\nexport const Nav = () => <Search />;\n",
      'src/search.tsx': 'export function Search() {\n  return <input type="search" />;\n}\n',
    };

    expect(redefined(files, {}, { 'lucide-react': '1' })).toEqual([]);
  });

  it('does not count what stories, mocks and fixtures render', () => {
    const files = {
      'src/card.stories.tsx': usesCard('Story'),
      'src/__mocks__/a.tsx': usesCard('A'),
      'src/fixtures/b.tsx': usesCard('B'),
      'src/card.tsx': ownCard,
    };

    expect(redefined(files)).toEqual([]);
  });

  it.each([
    [
      'a named import under another local name',
      "import { Card as BaseCard } from '@acme/ui';\nexport function Card() {\n  return <BaseCard />;\n}\n",
    ],
    [
      'a namespace import',
      "import * as UI from '@acme/ui';\nexport function Card() {\n  return <UI.Card />;\n}\n",
    ],
    [
      'a default import under another name',
      "import MuiCard from '@acme/ui';\nexport function Card() {\n  return <MuiCard />;\n}\n",
    ],
    [
      'any other import from the package',
      "import { Icon } from '@acme/ui';\nexport function Card() {\n  return <Icon />;\n}\n",
    ],
  ])('accepts a wrapper that imports from the package: %s', (_, wrapper) => {
    expect(redefined({ 'src/a.tsx': usesCard('A'), 'src/card.tsx': wrapper })).toEqual([]);
  });

  it.each([
    ['re-exports a name', "export { Card } from '@acme/ui';\n"],
    ['re-exports everything', "export * from '@acme/ui';\n"],
    ['exports an imported name again', "import { Card } from '@acme/ui';\nexport { Card };\n"],
    ['re-exports another project barrel', "export * from './kit';\n"],
  ])('accepts a wrapper that imports the package through a project barrel that %s', (_, barrel) => {
    const files = {
      'src/a.tsx': usesCard('A'),
      'src/ui/index.ts': barrel,
      'src/ui/kit.ts': "export * from '@acme/ui';\n",
      'src/features/card.tsx':
        "import { Card as Base } from '../ui';\nexport function Card() {\n  return <Base />;\n}\n",
    };

    expect(redefined(files)).toEqual([]);
  });

  it('counts a workspace package as a library, but not against its own components', () => {
    const files = workspaceFiles({
      'packages/ui/src/index.ts': "export { Card } from './card';\n",
      'packages/ui/src/card.tsx': ownCard,
      'packages/web/src/page.tsx': usesCard('Page'),
      'packages/web/src/card.tsx': ownCard,
    });

    expect(rows(findingsFor(files, WORKSPACE_POLICY))).toEqual([
      ['redefined-library-component', 'packages/web/src/card.tsx', 'component:Card'],
    ]);
  });

  it('does not follow a project module that only imports the package', () => {
    const files = {
      'src/a.tsx': usesCard('A'),
      'src/ui/index.ts': "import { Card } from '@acme/ui';\nexport const cards = [Card];\n",
      'src/features/card.tsx':
        "import { cards } from '../ui';\nexport function Card() {\n  return <div>{cards.length}</div>;\n}\n",
    };

    expect(rows(redefined(files)).map(([, file]) => file)).toEqual(['src/features/card.tsx']);
  });

  it('counts a default import only from a deep path whose last segment is the local name', () => {
    const files = {
      'src/a.tsx': source(
        "import Button from '@acme/ui/Button';",
        "import Chip from '@acme/ui';",
        'export const A = () => <><Button /><Chip /></>;',
      ),
      'src/button.tsx': 'export const Button = () => <button />;\n',
      'src/chip.tsx': 'export const Chip = () => <span />;\n',
    };

    expect(rows(redefined(files))).toEqual([
      ['redefined-library-component', 'src/button.tsx', 'component:Button'],
    ]);
  });

  it('does not count packages missing from package.json, bundler aliases or type-only imports', () => {
    const rendered = (specifier, name) =>
      `import { ${name} } from '${specifier}';\nexport const X${name} = () => <${name} />;\n`;
    const files = {
      'tsconfig.json': JSON.stringify({
        compilerOptions: { types: [], lib: ['ES2022'], paths: { '@kit/*': ['src/kit/*'] } },
      }),
      'src/kit/card.tsx': 'export const Card = () => <div />;\n',
      'src/kit/chip.tsx': 'export const Chip = () => <div />;\n',
      'src/kit/badge.tsx': 'export const Badge = () => <div />;\n',
      'src/kit/panel.tsx': 'export const Panel = () => <div />;\n',
      'src/kit/tab.tsx': 'export const Tab = () => <div />;\n',
      'src/a.tsx': [
        rendered('./kit/card', 'Card'),
        rendered('@kit/chip', 'Chip'),
        rendered('@/kit/badge', 'Badge'),
        rendered('@components/Panel', 'Panel'),
        rendered('not-a-dependency', 'Tab'),
      ].join(''),
      'src/b.tsx':
        "import type { Card } from '@acme/ui';\nexport const B = null as unknown as Card;\n",
    };

    expect(redefined(files)).toEqual([]);
  });

  it('reports arrow functions, function expressions, memo and forwardRef components in .tsx and .jsx files', () => {
    const files = {
      'src/a.tsx': [
        "import { Card, Chip, Badge, Panel, Tab } from '@acme/ui';",
        'export const A = () => <><Card /><Chip /><Badge /><Panel /><Tab /></>;',
      ].join('\n'),
      'src/card.tsx': 'export const Card = (props: object) => <div {...props} />;\n',
      'src/chip.tsx': 'export const Chip = function () {\n  return <div />;\n};\n',
      'src/badge.jsx': 'export const Badge = memo(() => <div />);\n',
      'src/panel.tsx':
        'export const Panel = React.forwardRef((props, ref) => <div ref={ref} />);\n',
      'src/tab.ts': 'export function Tab() {\n  return null;\n}\n',
      'src/lower.tsx': 'export const card = () => <div />;\n',
    };

    expect(rows(redefined(files)).map(([, file]) => file)).toEqual([
      'src/badge.jsx',
      'src/card.tsx',
      'src/chip.tsx',
      'src/panel.tsx',
    ]);
  });

  it('is off outside the React scope and follows react.enabled', () => {
    const files = { 'src/a.tsx': usesCard('A'), 'src/card.tsx': ownCard };
    const manifest = { 'package.json': JSON.stringify({ dependencies: { '@acme/ui': '1' } }) };

    expect(findingsOf({ ...manifest, ...files })).toEqual([]);
    expect(redefined(files, { react: { enabled: false } })).toEqual([]);
    expect(findingsOf({ ...manifest, ...files }, { react: { enabled: true } })).toHaveLength(1);
  });

  it('is lifted by an exception for the defining file', () => {
    const files = { 'src/a.tsx': usesCard('A'), 'src/card.tsx': ownCard };
    const exception = {
      rule: 'redefined-library-component',
      paths: ['src/card.tsx'],
      reason: 'kept',
    };

    expect(redefined(files, { exceptions: [exception] })).toEqual([]);
  });
});
