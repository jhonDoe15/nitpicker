import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  compilePsiProgram,
  gradleClasspath,
  pinnedKotlinCompiler,
  writeSources,
} from '../../test-support/kotlin/kotlin-psi-program.mjs';
import { FACTS_EXPECTED } from './test-support/facts-expected.mjs';
import { FACTS_SOURCE } from './test-support/facts-sources.mjs';

const enabled = process.env.NITPICKER_KOTLIN_E2E === '1';
const gradle = process.env.NITPICKER_GRADLE ?? 'gradle';
const fixtures = path.resolve(import.meta.dirname, '../../../ingest/fixtures');
const MEASUREMENT_FACTS = path.resolve(
  import.meta.dirname,
  '../../../ingest/kotlin-mutants/test-support/kotlin-measurement-facts.json',
);

let workspace;
let java;
let classpath;
let classes;

function mutationFactsOf(project, roots = ['src']) {
  const metrics = path.join(project, 'metrics.json');
  const facts = path.join(project, 'facts.json');
  const result = spawnSync(
    path.join(java, 'bin/java'),
    [
      `-Dnitpicker.kotlinCompiler=${pinnedKotlinCompiler()}`,
      '-cp',
      `${classpath}${path.delimiter}${classes}`,
      'nitpicker.kotlinpsi.KotlinPsi',
      metrics,
      facts,
      project,
      ...roots,
    ],
    { cwd: project, encoding: 'utf8', timeout: 180_000 },
  );
  expect(result.status, result.stdout + result.stderr).toBe(0);
  return JSON.parse(readFileSync(path.join(project, 'kotlin-mutation-facts.json'), 'utf8'));
}

function measurementSources() {
  const sourceRoot = path.join(fixtures, 'kotlin-measurement/src/main/kotlin');
  return Object.fromEntries(
    readdirSync(sourceRoot, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => {
        const file = path.join(entry.parentPath, entry.name);
        return [`src/main/kotlin/${path.relative(sourceRoot, file)}`, readFileSync(file, 'utf8')];
      }),
  );
}

describe.skipIf(!enabled)('the mutation facts of the kotlin-psi program', () => {
  beforeAll(() => {
    workspace = mkdtempSync(path.join(tmpdir(), 'nitpicker-kotlin-facts-'));
    const project = path.join(workspace, 'project');
    cpSync(path.resolve(import.meta.dirname, '../../fixtures/kotlin-project'), project, {
      recursive: true,
    });
    ({ javaHome: java, classpath } = gradleClasspath({ gradle, project, workspace }));
    classes = compilePsiProgram({ java, classpath, workspace });
  });

  afterAll(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  it('reports the classes, properties, functions, lambdas and branching lines of a file', () => {
    const project = writeSources(workspace, 'facts', { 'src/demo/Facts.kt': FACTS_SOURCE });

    expect(mutationFactsOf(project)).toEqual({ files: [FACTS_EXPECTED] });
  });

  it('leaves out the test roots, which PIT does not mutate', () => {
    const project = writeSources(workspace, 'roots', {
      'src/main/Main.kt': 'package demo\n\nfun go() = 1\n',
      'src/test/Check.kt': 'package demo\n\nfun check() = 2\n',
    });

    expect(
      mutationFactsOf(project, ['src/main', 'test:src/test']).files.map(({ file }) => file),
    ).toEqual(['src/main/Main.kt']);
  });

  it('reports the facts the measurement test of the filter pins for the kotlin-measurement fixture', () => {
    const project = writeSources(workspace, 'measurement', measurementSources());

    expect(mutationFactsOf(project, ['src/main/kotlin'])).toEqual(
      JSON.parse(readFileSync(MEASUREMENT_FACTS, 'utf8')),
    );
  });
});
