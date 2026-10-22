import { describe } from 'vitest';
import {
  addRedBaseBranches,
  createRepository,
  redBaseCases,
} from '../../red-base/test-support/red-base-cases.mjs';

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

describe.skipIf(process.env.NITPICKER_KOTLIN_E2E !== '1')(
  'Kotlin preset on a base whose tests fail',
  () => {
    redBaseCases({
      policy: { preset: 'kotlin' },
      setup: () => {
        const root = createRepository({
          fixture: 'kotlin-project',
          ignored: '/build/\n/.gradle/\n/.kotlin/\n',
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
        ],
      },
    });
  },
);
