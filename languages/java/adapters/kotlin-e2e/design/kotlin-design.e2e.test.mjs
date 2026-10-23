import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { validateFacts } from '../../../../../shared/rules/facts/schema.mjs';
import { kotlinDesignBundle } from '../../kotlin/review-rules/design/kotlin-design.mjs';
import { prepareCompiler, runPsiProgram } from '../../test-support/kotlin-psi-program.mjs';

// Runs kotlin-psi on the Kotlin sources of fixtures/kotlin-design and compares the design facts it
// writes with the recorded design-facts.json. It needs Java 21 and either Gradle with network
// access to Maven Central or NITPICKER_KOTLIN_COMPILER_CLASSPATH (the jars of the pinned
// kotlin-compiler-embeddable), so it only runs with NITPICKER_KOTLIN_E2E=1 (`npm run test:kotlin`).
// After a change to the program, record the facts again: run the program on the fixture sources and
// write the `design` key of its facts file to design-facts.json.

const enabled = process.env.NITPICKER_KOTLIN_E2E === '1';
const gradle = process.env.NITPICKER_GRADLE ?? 'gradle';
const FIXTURES = path.resolve(import.meta.dirname, '../../fixtures');
const DESIGN_FIXTURE = path.join(FIXTURES, 'kotlin-design');
const PUBLISHED_FIXTURE = path.join(FIXTURES, 'kotlin-design-published');

let workspace;
let compiler;

function projectWith(name, files) {
  const dir = path.join(workspace, name);
  for (const [relative, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, relative)), { recursive: true });
    writeFileSync(path.join(dir, relative), content);
  }
  return dir;
}

describe.skipIf(!enabled)('Kotlin design facts from the PSI program', () => {
  beforeAll(() => {
    workspace = mkdtempSync(path.join(tmpdir(), 'nitpicker-kotlin-design-'));
    const gradleProject = path.join(workspace, 'gradle-project');
    cpSync(path.join(FIXTURES, 'kotlin-project'), gradleProject, { recursive: true });
    compiler = prepareCompiler({
      workspace,
      project: gradleProject,
      gradle,
      environment: process.env,
    });
  });

  afterAll(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  it('writes the recorded design facts for the fixture sources, and they pass the facts schema', () => {
    const project = path.join(workspace, 'design');
    cpSync(path.join(DESIGN_FIXTURE, 'src'), path.join(project, 'src'), { recursive: true });

    const { status, log, facts } = runPsiProgram(compiler, project, ['src']);
    const recorded = JSON.parse(
      readFileSync(path.join(DESIGN_FIXTURE, 'design-facts.json'), 'utf8'),
    );

    expect(status, log).toBe(0);
    expect(facts.design).toEqual(recorded);
    expect(() => validateFacts(kotlinDesignBundle(facts.design))).not.toThrow();
  });

  it('marks the exported types and top-level functions of a published module', () => {
    const project = path.join(workspace, 'design-published');
    cpSync(path.join(PUBLISHED_FIXTURE, 'src'), path.join(project, 'src'), { recursive: true });

    const { status, log, facts } = runPsiProgram({ ...compiler, published: true }, project, [
      'src',
    ]);
    const recorded = JSON.parse(
      readFileSync(path.join(PUBLISHED_FIXTURE, 'design-facts.json'), 'utf8'),
    );

    expect(status, log).toBe(0);
    expect(facts.design).toEqual(recorded);
    expect(() => validateFacts(kotlinDesignBundle(facts.design))).not.toThrow();
  });

  it('leaves published out for the same sources when the module is not published', () => {
    const project = path.join(workspace, 'design-unpublished');
    cpSync(path.join(PUBLISHED_FIXTURE, 'src'), path.join(project, 'src'), { recursive: true });

    const { facts } = runPsiProgram(compiler, project, ['src']);
    const published = [...facts.design.types, ...facts.design.callables].filter(
      (item) => 'published' in item,
    );

    expect(published).toEqual([]);
  });

  it('leaves published out for a published module that is an application', () => {
    const project = projectWith('published-application', {
      'src/Main.kt': 'package demo\n\nclass Tool { fun go() = 1 }\n\nfun main() { Tool().go() }\n',
    });

    const { facts } = runPsiProgram({ ...compiler, published: true }, project, ['src']);
    const published = [...facts.design.types, ...facts.design.callables].filter(
      (item) => 'published' in item,
    );

    expect(published).toEqual([]);
  });

  it('writes empty design facts when the project has only test sources', () => {
    const project = projectWith('only-tests', {
      'src/test/Check.kt': 'package demo\n\nclass Check { fun go() = 1 }\n',
    });

    const { status, facts } = runPsiProgram(compiler, project, ['test:src/test']);

    expect([status, facts.design]).toEqual([0, { modules: [], types: [], callables: [] }]);
  });

  it('keeps test sources out of the design facts', () => {
    const project = projectWith('with-tests', {
      'src/main/Main.kt': 'package demo\n\nclass Main { fun go() = 1 }\n',
      'src/test/Check.kt': 'package demo\n\nclass Check { fun go() = 1 }\n',
    });

    const { facts } = runPsiProgram(compiler, project, ['src/main', 'test:src/test']);

    expect(facts.design.modules).toEqual([{ file: 'src/main/Main.kt', role: 'production' }]);
    expect(facts.design.types.map(({ name }) => name)).toEqual(['Main']);
  });
});
