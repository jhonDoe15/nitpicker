import { describe } from 'vitest';
import { createRepository } from '../../red-base/test-support/red-base-cases.mjs';
import { compileErrorCases } from '../../red-base/test-support/compile-error-cases.mjs';

const gradle = process.env.NITPICKER_GRADLE ?? 'gradle';

const BROKEN = `package demo

class Greeter {
    fun greet(name: String): String = missing(name)
}
`;

describe.skipIf(process.env.NITPICKER_KOTLIN_E2E !== '1')(
  'Kotlin preset on a Gradle change that does not compile',
  () => {
    compileErrorCases({
      environment: { ...process.env, NITPICKER_GRADLE: gradle },
      preset: 'kotlin',
      source: 'src/main/kotlin/demo/Greeter.kt',
      broken: BROKEN,
      line: 4,
      failureRule: 'gradle-failure',
      setup: () =>
        createRepository({
          preset: 'kotlin',
          fixture: 'kotlin-project',
          ignored: '/build/\n/.gradle/\n/.kotlin/\n',
          files: {},
        }),
    });
  },
);
