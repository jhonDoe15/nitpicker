import { describe } from 'vitest';
import {
  addRedBaseBranches,
  createRepository,
  redBaseCases,
} from '../../red-base/test-support/red-base-cases.mjs';

const gradle = process.env.NITPICKER_GRADLE ?? 'gradle';

const JAVA_LEGACY = `package demo;

public final class Legacy {
  private int leftover;

  public int value() {
    return 1;
  }
}
`;

const JAVA_BAD = `package demo;

public final class Bad {
  public String decode(byte[] bytes) {
    try {
      Integer.parseInt("x");
    } catch (NumberFormatException e) {
    }
    return new String(bytes);
  }
}
`;

describe.skipIf(process.env.NITPICKER_JAVA_E2E !== '1')(
  'Java preset on a base whose tests fail',
  () => {
    redBaseCases({
      gradle,
      policy: { preset: 'java' },
      setup: () => {
        const root = createRepository({
          fixture: 'gradle-project',
          ignored: 'build/\n.gradle/\n',
          files: { 'src/main/java/demo/Legacy.java': JAVA_LEGACY },
        });
        addRedBaseBranches(root, {
          testPath: 'src/test/java/demo/GreeterTest.java',
          bad: { 'src/main/java/demo/Bad.java': JAVA_BAD },
        });
        return root;
      },
      expected: {
        legacy: 'pmd UnusedPrivateField Legacy.java',
        violation: [
          'checkstyle com.puppycrawl.tools.checkstyle.checks.blocks.EmptyCatchBlockCheck Bad.java',
          'pit mutant-nocoverage Bad.java',
          'pmd EmptyCatchBlock Bad.java',
          'spotbugs DM_DEFAULT_ENCODING Bad.java',
        ],
      },
    });
  },
);
