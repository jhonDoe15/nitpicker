import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FACTS_EXPECTED, FACTS_SOURCE } from '../fixtures/kotlin-mutation-facts/sources.mjs';
import { gradleClasspath, runPsiProgram, writeSources } from './psi-program.mjs';

// Runs KotlinMutationFacts.java, the PSI program behind the Kotlin mutation filter, on source files.
// It needs Java 21, Gradle and network access to Maven Central (for the Kotlin compiler the init
// script pins), so it only runs with NITPICKER_KOTLIN_E2E=1 (`npm run test:kotlin`).

const enabled = process.env.NITPICKER_KOTLIN_E2E === '1';
const gradle = process.env.NITPICKER_GRADLE ?? 'gradle';
const factsSource = path.resolve(import.meta.dirname, '../../gradle/KotlinMutationFacts.java');

let workspace;
let java;
let classpath;

describe.skipIf(!enabled)('KotlinMutationFacts on source files', () => {
  beforeAll(() => {
    workspace = mkdtempSync(path.join(tmpdir(), 'nitpicker-kotlin-facts-'));
    const project = path.join(workspace, 'project');
    cpSync(path.resolve(import.meta.dirname, '../fixtures/kotlin-project'), project, {
      recursive: true,
    });
    ({ javaHome: java, classpath } = gradleClasspath({ gradle, project, workspace }));
  });

  afterAll(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  it('reports the classes, properties, functions, lambdas and branching lines of a file', () => {
    const project = writeSources(workspace, 'facts', { 'src/demo/Facts.kt': FACTS_SOURCE });
    const { result } = runPsiProgram({ java, classpath, source: factsSource, project });

    expect(result).toEqual({ files: [FACTS_EXPECTED] });
  });
});
