import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FACTS_EXPECTED } from './test-support/facts-expected.mjs';
import { FACTS_SOURCE } from './test-support/facts-sources.mjs';
import { gradleClasspath, runPsiProgram, writeSources } from './test-support/psi-program.mjs';

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

  it('reports the facts the measurement test of the filter pins for the kotlin-measurement fixture', () => {
    const fixtures = path.resolve(import.meta.dirname, '../../ingest/fixtures');
    const sourceRoot = path.join(fixtures, 'kotlin-measurement/src/main/kotlin');
    const sources = Object.fromEntries(
      readdirSync(sourceRoot, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => {
          const file = path.join(entry.parentPath, entry.name);
          return [`src/main/kotlin/${path.relative(sourceRoot, file)}`, readFileSync(file, 'utf8')];
        }),
    );
    const project = writeSources(workspace, 'measurement', sources);
    const { result } = runPsiProgram({ java, classpath, source: factsSource, project });

    expect(result).toEqual(
      JSON.parse(readFileSync(path.join(fixtures, 'kotlin-measurement-facts.json'), 'utf8')),
    );
  });
});
