import { describe } from 'vitest';
import { createRepository } from '../../red-base/test-support/red-base-cases.mjs';
import { compileErrorCases } from '../../red-base/test-support/compile-error-cases.mjs';

const gradle = process.env.NITPICKER_GRADLE ?? 'gradle';

const BROKEN = `package demo;

public final class Greeter {
  public String greet(String name) {
    return missing(name);
  }
}
`;

describe.skipIf(process.env.NITPICKER_JAVA_E2E !== '1')(
  'Java preset on a Gradle change that does not compile',
  () => {
    compileErrorCases({
      environment: { ...process.env, NITPICKER_GRADLE: gradle },
      preset: 'java',
      source: 'src/main/java/demo/Greeter.java',
      broken: BROKEN,
      line: 5,
      failureRule: 'gradle-failure',
      setup: () =>
        createRepository({
          preset: 'java',
          fixture: 'gradle-project',
          ignored: 'build/\n.gradle/\n',
          files: {},
        }),
    });
  },
);
