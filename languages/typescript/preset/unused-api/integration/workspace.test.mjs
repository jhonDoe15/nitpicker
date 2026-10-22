import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  analyzeFiles,
  analyzeProject,
  createProject,
  removeProject,
  summarize,
} from '../test-support/project.mjs';

const COMPONENT = `type BadgeProps = { tone?: string; size?: number; icon?: string };
export function Badge(props: BadgeProps) { return <i>{props.tone}</i>; }
`;
const CALLERS = {
  'src/badge.tsx': COMPONENT,
  'src/shown.tsx':
    'import { Badge } from \'./badge\';\nexport const Shown = () => <Badge tone="a" />;\n',
  'src/badge.test.tsx':
    "import { Badge } from './badge';\nexport const check = () => <Badge size={1} />;\n",
  'src/badge.stories.tsx':
    'import { Badge } from \'./badge\';\nexport const Primary = () => <Badge icon="x" />;\n',
};
const LIBRARY = { name: 'library', main: 'src/index.ts' };

function iconMessage(scope) {
  return (
    'Prop Badge.icon is never passed. Remove it, or pass it from a real caller ' +
    `(${scope}). If this is intended, add ` +
    '{"rule":"unused-prop","paths":["src/badge.tsx"],"reason":"..."} ' +
    'to "exceptions" in nitpicker.config.json.'
  );
}

function without(files, name) {
  return Object.fromEntries(Object.entries(files).filter(([file]) => file !== name));
}

describe('who counts as a caller', () => {
  it('counts only production callers in a private package, a nameless one or one that ships nothing', () => {
    const manifests = [
      { name: 'app', private: true },
      { version: '1.0.0' },
      { name: 'tool', version: '1.0.0' },
    ];
    const results = manifests.map((manifest) => summarize(analyzeFiles(CALLERS, { manifest })));
    const appOnly = [
      'unused-prop src/badge.tsx Badge.icon',
      'unused-prop src/badge.tsx Badge.size',
    ];

    expect(results).toEqual([appOnly, appOnly, appOnly]);
  });

  it('counts the own tests and stories of a published package and says so', () => {
    expect(analyzeFiles(CALLERS, { manifest: LIBRARY })).toEqual([]);
    expect(
      analyzeFiles(without(CALLERS, 'src/badge.stories.tsx'), { manifest: LIBRARY }).map(
        ({ message }) => message,
      ),
    ).toEqual([iconMessage('tests, stories and examples of this package count')]);
  });
});

const WORKSPACE = {
  'package.json': { name: 'repo', private: true },
  'pnpm-workspace.yaml': "packages: ['packages/*', '!packages/legacy']\n",
  'packages/ui/package.json': { name: '@scope/ui', private: true, main: 'dist/index.js' },
  'packages/ui/src/index.ts': "export * from './badge';\n",
  'packages/ui/src/badge.tsx': COMPONENT,
  'packages/ui/src/chip.tsx': COMPONENT.replaceAll('Badge', 'Chip'),
  'packages/ui/lib/entry.ts': "export * from '../src/chip';\n",
  'packages/kit/package.json': { name: '@scope/kit', private: true, types: 'lib/entry.ts' },
  'packages/kit/lib/entry.ts': "export * from '../../ui/src/chip';\n",
  'packages/app/package.json': { name: '@scope/app', private: true },
  'packages/app/src/app.tsx': `import { Badge } from '@scope/ui';
import { Badge as Direct } from '@scope/ui/badge';
import { Chip } from '@scope/kit';
export const App = () => <><Badge tone="a" /><Direct size={2} /><Chip tone="b" size={1} /></>;
`,
  'packages/legacy/package.json': { name: '@scope/legacy', private: true },
  'packages/legacy/src/old.tsx': `import { Chip } from '@scope/ui/chip';
export const Old = () => <Chip icon="i" />;
`,
};

let root;
let findings;

beforeAll(() => {
  root = createProject(WORKSPACE);
  findings = summarize(analyzeProject(path.join(root, 'packages/ui')));
});

afterAll(() => {
  removeProject(root);
});

describe('workspace packages', () => {
  it('maps siblings to their source through the manifest entry, the source root and subpaths', () => {
    expect(findings).toEqual([
      'unused-prop src/badge.tsx Badge.icon',
      'unused-prop src/chip.tsx Chip.icon',
    ]);
  });
});
