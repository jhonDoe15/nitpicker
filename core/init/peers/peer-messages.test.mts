import { describe, expect, it } from 'vitest';
import { packageVersion } from '../../help/package-version.mts';
import { useProjects, withPeers } from '../test-support/projects.mts';
import { quotedTypescriptPin } from '../test-support/typescript-pin.mts';
import { planPeers } from './peer-plan.mts';
import type { InitProject } from '../init-types.mts';
import { fieldOf, fieldsOf, textOf } from '../../../shared/values/readers.mts';
import { javascriptApiPin } from '../test-support/typescript-pin.mts';

const project = useProjects();
const NITPICKER = `nitpicker@${packageVersion()}`;
const YARN: InitProject = {
  family: 'node',
  preset: 'typescript',
  summary: '',
  notes: [],
  packageManager: {
    add: 'yarn add --dev',
    install: 'yarn',
    run: 'yarn',
    name: 'yarn',
    root: '.',
    locked: false,
  },
  testRunner: 'vitest',
};

function olderApp(versions: Readonly<Record<string, string>>): string {
  return project({
    ...withPeers({
      typescript: '5.4.5',
      vitest: '2.1.4',
      '@vitest/coverage-v8': '2.1.4',
      ...versions,
    }),
    'node_modules/@types/node/package.json': JSON.stringify({
      name: '@types/node',
      version: '25.6.0',
    }),
  });
}

describe('peer plan for an older React app', () => {
  it('says "too old" for a package that is installed but too old', () => {
    const plan = planPeers(olderApp({ vite: '6.0.1' }), YARN);

    expect(plan.outdated).toEqual([
      'typescript too old (have 5.4.5, need >=5.7)',
      'vitest too old (have 2.1.4, need ^3.2.0 || ^4.1.11 || ^5.0.0)',
      '@vitest/coverage-v8 too old (have 2.1.4, need ^3.2.0 || ^4.1.11 || ^5.0.0)',
    ]);
    expect(plan.absent).toEqual([NITPICKER]);
  });

  it('pins typescript to the range of the tools nitpicker runs', () => {
    const plan = planPeers(olderApp({ vite: '6.0.1' }), YARN);

    expect(plan.command).toBe(
      `yarn add --dev ${NITPICKER} ${quotedTypescriptPin()} 'vitest@^4.1.11' '@vitest/coverage-v8@^4.1.11'`,
    );
  });

  it('prints the Vitest that works with the installed Vite', () => {
    const plan = planPeers(olderApp({ vite: '6.0.1' }), YARN);

    expect(plan.command).toBe(
      `yarn add --dev ${NITPICKER} ${quotedTypescriptPin()} 'vitest@^4.1.11' '@vitest/coverage-v8@^4.1.11'`,
    );
    expect(plan.blockers).toEqual([]);
  });

  it('asks for the lowest supported Vitest over an old one when the installed Vite takes it', () => {
    const plan = planPeers(olderApp({ vite: '7.1.0' }), YARN);

    expect(plan.command).toBe(
      `yarn add --dev ${NITPICKER} ${quotedTypescriptPin()} 'vitest@^3.2.0' '@vitest/coverage-v8@^3.2.0'`,
    );
  });

  it('says to upgrade Vite first when no supported Vitest runs on it', () => {
    const plan = planPeers(olderApp({ vite: '4.5.0' }), YARN);

    expect(plan.command).toBe(`yarn add --dev ${NITPICKER} ${quotedTypescriptPin()}`);
    expect(plan.outdated).toEqual([
      'typescript too old (have 5.4.5, need >=5.7)',
      'vitest too old (have 2.1.4, need ^3.2.0 || ^4.1.11 || ^5.0.0)',
      '@vitest/coverage-v8 too old (have 2.1.4, need ^3.2.0 || ^4.1.11 || ^5.0.0)',
    ]);
    expect(plan.blockers).toEqual([
      [
        'No Vitest that nitpicker supports (^3.2.0 || ^4.1.11 || ^5.0.0) runs with the installed packages: ',
        'Vitest 5 needs vite ^6.4.0 || ^7.0.0 || ^8.0.0 but the project has 4.5.0; ',
        'Vitest 4 needs vite ^6.0.0 || ^7.0.0 || ^8.0.0 but the project has 4.5.0; ',
        'Vitest 3 needs vite ^5.0.0 || ^6.0.0 || ^7.0.0 but the project has 4.5.0. ',
        'Upgrade vite first (for example npm install --save-dev vite@latest), then run nitpicker init again.',
      ].join(''),
    ]);
  });

  it('reads a declared Vite when it is not installed', () => {
    const files = withPeers({ typescript: '5.4.5', vitest: '2.1.4' });
    const manifest: unknown = JSON.parse(textOf(files['package.json']));
    const edited = {
      ...fieldsOf(manifest),
      devDependencies: { ...fieldsOf(fieldOf(manifest, 'devDependencies')), vite: '^4.5.0' },
    };
    const plan = planPeers(project({ ...files, 'package.json': JSON.stringify(edited) }), YARN);

    expect(plan.blockers).toHaveLength(1);
  });

  it('keeps the TypeScript 6 request for a Node.js that cannot run the TypeScript 7 bridge', () => {
    const plan = planPeers(olderApp({ vite: '6.0.1' }), YARN, '22.18.1');

    expect(plan.command).toBe(
      `yarn add --dev ${NITPICKER} '${javascriptApiPin()}' 'vitest@^4.1.11' '@vitest/coverage-v8@^4.1.11'`,
    );
  });
});
