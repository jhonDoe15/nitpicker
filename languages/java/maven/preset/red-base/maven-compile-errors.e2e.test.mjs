import { cpSync, rmSync } from 'node:fs';
import path from 'node:path';
import { describe } from 'vitest';
import { createRepository } from '../../../adapters/red-base/test-support/red-base-cases.mjs';
import { compileErrorCases } from '../../../adapters/red-base/test-support/compile-error-cases.mjs';
import { runGitIn } from '../../../adapters/test-support/gradle-e2e.mjs';

const pom = path.join(import.meta.dirname, '../../fixtures/single');

const BROKEN = `package demo;

public final class Greeter {
  public String greet(String name) {
    return missing(name);
  }
}
`;

function mavenRepository() {
  const root = createRepository({
    preset: 'java',
    fixture: 'gradle-project',
    ignored: 'target/\n',
    files: {},
  });
  cpSync(pom, root, { recursive: true });
  for (const name of ['build.gradle', 'settings.gradle']) {
    rmSync(path.join(root, name));
  }
  runGitIn(root, 'add', '-A');
  runGitIn(root, 'commit', '-q', '-m', 'maven');
  return root;
}

describe.skipIf(process.env.NITPICKER_JAVA_E2E !== '1')(
  'Java preset on a Maven change that does not compile',
  () => {
    compileErrorCases({
      environment: process.env,
      preset: 'java',
      source: 'src/main/java/demo/Greeter.java',
      broken: BROKEN,
      line: 5,
      failureRule: 'maven-failure',
      setup: mavenRepository,
    });
  },
);
