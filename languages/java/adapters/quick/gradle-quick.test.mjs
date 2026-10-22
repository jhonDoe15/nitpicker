import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { collectJavaFindings } from '../java-diff.mjs';
import { fakeGradleRun } from '../test-support/in-process-gradle.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

const KILLED_MUTANT =
  "<mutations><mutation detected='true' status='KILLED'><sourceFile>A.java</sourceFile><mutatedClass>demo.A</mutatedClass><mutatedMethod>run</mutatedMethod><methodDescription>()V</methodDescription><lineNumber>3</lineNumber><mutator>org.pitest.mutationtest.engine.gregor.mutators.VoidMethodCallMutator</mutator><description>removed call</description></mutation></mutations>";
const UNCOVERED_JACOCO =
  '<report name="demo"><package name="demo"><sourcefile name="A.java"><line nr="3" mi="3" ci="0" mb="0" cb="0"/></sourcefile></package></report>';

function project() {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-gradle-quick-'));
  roots.push(root);
  const files = {
    'src/main/java/demo/A.java': 'package demo;\n',
    'src/main/kotlin/demo/K.kt': 'package demo\n',
    'violations.txt': 'Avoid unused field: added\n',
    'detekt.txt': 'Magic number 42\n',
    'mutations.xml': KILLED_MUTANT,
    'jacoco.xml': UNCOVERED_JACOCO,
  };
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
  return root;
}

function collect(root, policy) {
  return collectJavaFindings(root, { ...fakeGradleRun, policy });
}

function gradleArguments(root) {
  return JSON.parse(readFileSync(path.join(root, 'build/gradle-args.json'), 'utf8'));
}

function quickProperties(root) {
  return gradleArguments(root).filter((argument) => argument.startsWith('-Pnitpicker.quick'));
}

function toolsOf(findings) {
  return [...new Set(findings.map(({ tool }) => tool))];
}

describe.each(['java', 'kotlin'])('the %s preset on a Gradle build', (preset) => {
  it('passes the quick property to Gradle only for a quick run', () => {
    const quick = project();
    const full = project();

    collect(quick, { preset, quick: true });
    collect(full, { preset });

    expect(quickProperties(quick)).toEqual(['-Pnitpicker.quick=true']);
    expect(quickProperties(full)).toEqual([]);
  });

  it('reads no coverage, CRAP or mutation findings from a quick run', () => {
    const quickTools = toolsOf(collect(project(), { preset, quick: true }));
    const fullTools = toolsOf(collect(project(), { preset }));

    expect(fullTools.filter((tool) => ['pit', 'pmd'].includes(tool)).sort()).toEqual([
      'pit',
      'pmd',
    ]);
    expect(quickTools.filter((tool) => ['pit', 'jacoco', 'crap', 'pmd'].includes(tool))).toEqual([
      'pmd',
    ]);
  });
});

describe('the kotlin preset in a quick run', () => {
  it('still reads the Kotlin static analysis', () => {
    const findings = collect(project(), { preset: 'kotlin', quick: true });

    expect(findings.some(({ tool }) => tool === 'detekt')).toBe(true);
  });
});
