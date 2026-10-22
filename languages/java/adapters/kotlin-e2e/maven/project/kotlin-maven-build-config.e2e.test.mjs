import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BAD } from '../../test-support/kotlin-lint-data.mjs';
import {
  commitBranch,
  initializeMavenProject,
  kotlinE2eEnabled,
  mavenDiffRunner,
  removeProject,
  summarize,
} from '../test-support/kotlin-maven-project.mjs';

const mavenDiffOf = mavenDiffRunner(process.env.NITPICKER_MAVEN);

const TEST_SUPPORT = `package demo

object TestSupport {
    const val GREETING = "Hello, Java!"
}
`;

const BRIDGE_TEST = `package demo;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

final class BridgeTest {
  @Test
  void saysHello() {
    assertEquals(TestSupport.GREETING, new Bridge().hello());
  }
}
`;

describe.skipIf(!kotlinE2eEnabled)('Kotlin preset on Maven: what the build compiles', () => {
  let project;

  beforeAll(() => {
    project = initializeMavenProject();
    commitBranch(project, 'mixed-tests', {
      'src/test/kotlin/demo/TestSupport.kt': TEST_SUPPORT,
      'src/test/java/demo/BridgeTest.java': BRIDGE_TEST,
      'src/main/unbuilt/demo/Dead.kt': BAD,
    });
  });

  afterAll(() => {
    removeProject(project);
  });

  it('analyzes a Java test that calls a Kotlin test helper and skips a folder the build never compiles', () => {
    const result = mavenDiffOf(project, 'mixed-tests');

    expect(result.failed).toBe(false);
    expect(summarize(result.newEnforceable)).toEqual([]);
    expect(
      [...result.newFindings, ...result.unchangedFindings].filter(({ path: file }) =>
        file.endsWith('Dead.kt'),
      ),
    ).toEqual([]);
  });
});
