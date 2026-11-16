import path from 'node:path';
import { describe } from 'vitest';
import {
  addRedBaseBranches,
  createRepository,
  redBaseCases,
} from '../../../red-base/test-support/red-base-cases.mts';
import { kotlinE2eEnabled } from '../__tests__/kotlin-maven-project.mts';

const KOTLIN_BAD = `package demo

class Bad {
    fun compute(a: Int, b: Int): Int {
        if (a > b) {
            return a
        }
        return b
    }
}
`;

const mavenFixtures = path.resolve(import.meta.dirname, '../../../../maven/fixtures');

describe.skipIf(!kotlinE2eEnabled)('Kotlin preset on Maven on a base whose tests fail', () => {
  redBaseCases({
    gradle: undefined,
    maven: process.env['NITPICKER_MAVEN'],
    environment: process.env,
    policy: { preset: 'kotlin' },
    setup: () => {
      const root = createRepository({
        preset: 'kotlin',
        fixture: 'kotlin-single',
        fixtureRoot: mavenFixtures,
        ignored: 'target/\n',
        files: {},
      });
      addRedBaseBranches(root, {
        testPath: 'src/test/kotlin/demo/GreeterTest.kt',
        bad: { 'src/main/kotlin/demo/Bad.kt': KOTLIN_BAD },
      });
      return root;
    },
    expected: {
      legacy: 'detekt detekt.style.UnusedPrivateProperty Legacy.kt',
      violation: [
        'jacoco changed-branch-coverage Bad.kt',
        'ktlint ktlint.standard:function-signature Bad.kt',
        'ktlint ktlint.standard:function-signature Bad.kt',
        'ktlint ktlint.standard:function-signature Bad.kt',
        ...Array.from({ length: 6 }, () => 'pit mutant-nocoverage Bad.kt'),
      ],
    },
  });
});
