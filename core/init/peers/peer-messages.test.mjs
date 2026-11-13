import { describe, expect, it } from 'vitest';
import { packageVersion } from '../../help/package-version.mts';
import { useProjects, withPeers } from '../test-support/projects.mjs';
import { quotedTypescriptPin } from '../test-support/typescript-pin.mjs';
import { planPeers } from './peer-plan.mts';
import { javascriptApiPin } from '../test-support/typescript-pin.mjs';

const project = useProjects();
const NITPICKER = `nitpicker@${packageVersion()}`;
const YARN = {
  family: 'node',
  packageManager: { add: 'yarn add --dev', install: 'yarn' },
  testRunner: 'vitest',
};

function olderApp(versions) {
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
  it('says "older than" for a package that is installed but too old', () => {
    const plan = planPeers(olderApp({ vite: '6.0.1' }), YARN);

    expect(plan.outdated).toEqual([
      'typescript 5.4.5 is older than 5.7',
      'vitest 2.1.4 is older than 4.1.11',
      '@vitest/coverage-v8 2.1.4 is older than 4.1.11',
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

  it('keeps the newest Vitest for a Vite that it accepts', () => {
    const plan = planPeers(olderApp({ vite: '7.1.0' }), YARN);

    expect(plan.command).toBe(
      `yarn add --dev ${NITPICKER} ${quotedTypescriptPin()} vitest @vitest/coverage-v8`,
    );
  });

  it('says to upgrade Vite first when no supported Vitest runs on it', () => {
    const plan = planPeers(olderApp({ vite: '5.4.11' }), YARN);

    expect(plan.command).toBe(`yarn add --dev ${NITPICKER} ${quotedTypescriptPin()}`);
    expect(plan.outdated).toEqual([
      'typescript 5.4.5 is older than 5.7',
      'vitest 2.1.4 is older than 4.1.11',
      '@vitest/coverage-v8 2.1.4 is older than 4.1.11',
    ]);
    expect(plan.blockers).toEqual([
      [
        'No Vitest that nitpicker supports (^4.1.11 || ^5.0.0) runs with the installed packages: ',
        'Vitest 5 needs vite ^6.4.0 || ^7.0.0 || ^8.0.0 but the project has 5.4.11; ',
        'Vitest 4 needs vite ^6.0.0 || ^7.0.0 || ^8.0.0 but the project has 5.4.11. ',
        'Upgrade vite first (for example npm install --save-dev vite@latest), then run nitpicker init again.',
      ].join(''),
    ]);
  });

  it('reads a declared Vite when it is not installed', () => {
    const files = withPeers({ typescript: '5.4.5', vitest: '2.1.4' });
    const manifest = JSON.parse(files['package.json']);
    manifest.devDependencies.vite = '^5.4.0';
    const plan = planPeers(project({ ...files, 'package.json': JSON.stringify(manifest) }), YARN);

    expect(plan.blockers).toHaveLength(1);
  });

  it('keeps the TypeScript 6 request for a Node.js that cannot run the TypeScript 7 bridge', () => {
    const plan = planPeers(olderApp({ vite: '6.0.1' }), YARN, '22.18.1');

    expect(plan.command).toBe(
      `yarn add --dev ${NITPICKER} '${javascriptApiPin()}' 'vitest@^4.1.11' '@vitest/coverage-v8@^4.1.11'`,
    );
  });
});
