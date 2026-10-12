import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { collectJavaFindings, runJavaDiff } from './java-diff.mjs';
import { analyzeJavaSnapshot } from './java-runner.mjs';

// End-to-end test of the Kotlin preset on a small mixed Kotlin and Java Gradle project. It needs
// Java 21, Gradle, lizard (see java-preset.e2e.test.mjs) and network access to Maven Central and
// the Gradle plugin portal (the Kotlin Gradle plugin, detekt, ktlint and ktfmt are downloaded on
// the first run), so it only runs with NITPICKER_KOTLIN_E2E=1 (`npm run test:kotlin`).
// NITPICKER_GRADLE overrides `gradle`. The script raises the test timeout to 15 minutes per step.

const enabled = process.env.NITPICKER_KOTLIN_E2E === '1';
const gradle = process.env.NITPICKER_GRADLE ?? 'gradle';
const kotlinPolicy = { preset: 'kotlin' };
const kotlinSources = 'src/main/kotlin/demo';

const FAREWELL = `package demo

class Farewell {
    fun goodbye(name: String): String = "Goodbye, $name."
}
`;

const FAREWELL_TEST = `package demo

import kotlin.test.Test
import kotlin.test.assertEquals

class FarewellTest {
    @Test
    fun saysFarewell() {
        assertEquals("Goodbye, Ada.", Farewell().goodbye("Ada"))
    }
}
`;

const LEGACY_WITH_COMMENT = `package demo

class Legacy {
    // Kept for compatibility.
    private val leftover = 1

    fun value(): Int = 1
}
`;

const BAD = `package demo

import java.util.*

class Bad {
    private val unused = 42
    fun compute(a:Int,b:Int):Int {
        val x = a*1000 + b*2000
        if (x > 5000) { return x }
        return 7777
    }
    fun other(a: Int): Int {
        return a * 1000
    }
}
`;

const META = `package demo

class Meta {
  fun label(name: String): String = "Meta, $name!"
}
`;

const DANGER = `package demo;

public final class Danger {
  public int parse(String text) {
    try {
      return Integer.parseInt(text);
    } catch (NumberFormatException e) {
    }
    return 0;
  }
}
`;

const BROKEN = 'package demo\n\nclass Broken {\n    fun incomplete(: Int\n}\n';

const MAGIC_NUMBER_OFF_WITH_FORMATTING_RULESET = `formatting:
  active: true
style:
  MagicNumber:
    active: false
`;

const GREETER_TEST_WITHOUT_JAVA = `package demo

import kotlin.test.Test
import kotlin.test.assertEquals

class GreeterTest {
    @Test
    fun greetsByName() {
        assertEquals("Hello, Ada!", Greeter().greet("Ada"))
    }
}
`;

const BAD_FINDINGS = [
  ...Array(6).fill('detekt detekt.style.MagicNumber Bad.kt'),
  'detekt detekt.style.UnusedPrivateProperty Bad.kt',
];

const BAD_KTLINT_RULES = [
  'ktlint.standard:blank-line-before-declaration',
  'ktlint.standard:colon-spacing',
  'ktlint.standard:comma-spacing',
  'ktlint.standard:function-expression-body',
  'ktlint.standard:function-return-type-spacing',
  'ktlint.standard:function-signature',
  'ktlint.standard:if-else-wrapping',
  'ktlint.standard:no-wildcard-imports',
  'ktlint.standard:op-spacing',
  'ktlint.standard:parameter-list-spacing',
  'ktlint.standard:statement-wrapping',
];

const LEGACY_FINDINGS = [
  'detekt detekt.style.FunctionOnlyReturningConstant Legacy.kt',
  'detekt detekt.style.UnusedPrivateProperty Legacy.kt',
];

let repository;
let mixedRepository;
let kotlinOnlyRepository;

function git(...args) {
  return execFileSync('git', args, {
    cwd: repository,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_AUTHOR_NAME: 'fixture',
      GIT_AUTHOR_EMAIL: 'fixture@example.com',
      GIT_COMMITTER_NAME: 'fixture',
      GIT_COMMITTER_EMAIL: 'fixture@example.com',
    },
  });
}

function writeAll(files) {
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(repository, relative);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
}

function commitBranch(name, files, removed = []) {
  git('checkout', '-q', '-b', name, 'main');
  writeAll(files);
  for (const relative of removed) {
    rmSync(path.join(repository, relative));
  }
  git('add', '-A');
  git('commit', '-q', '-m', name);
}

function initializeRepository() {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-kotlin-e2e-'));
  cpSync(path.resolve(import.meta.dirname, 'fixtures/kotlin-project'), root, { recursive: true });
  repository = root;
  writeAll({ '.gitignore': 'build/\n.gradle/\n.kotlin/\n' });
  git('init', '-q', '-b', 'main');
  git('add', '-A');
  git('commit', '-q', '-m', 'base with one legacy detekt finding');
  return root;
}

const summarize = (findings) =>
  findings.map(({ tool, rule, path: file }) => `${tool} ${rule} ${path.basename(file)}`).sort();

const fromTool = (findings, tool) => summarize(findings.filter((finding) => finding.tool === tool));

const ktlintOf = (findings) => findings.filter((finding) => finding.tool === 'ktlint');

const ktlintRules = (findings) => [...new Set(ktlintOf(findings).map(({ rule }) => rule))].sort();

const diffOf = (branch, policy = kotlinPolicy) => {
  git('checkout', '-q', branch);
  return runJavaDiff({ repositoryRoot: repository, requestedBaseRef: 'main', gradle, policy });
};

describe.skipIf(!enabled)('Kotlin preset end to end', () => {
  beforeAll(() => {
    kotlinOnlyRepository = initializeRepository();
    rmSync(path.join(kotlinOnlyRepository, 'src/main/java'), { recursive: true });
    writeAll({ 'src/test/kotlin/demo/GreeterTest.kt': GREETER_TEST_WITHOUT_JAVA });
    git('add', '-A');
    git('commit', '-q', '-m', 'Kotlin only');
    commitBranch('kotlin-only-violation', { [`${kotlinSources}/Bad.kt`]: BAD });
    mixedRepository = initializeRepository();
    commitBranch('clean', {
      [`${kotlinSources}/Farewell.kt`]: FAREWELL,
      'src/test/kotlin/demo/FarewellTest.kt': FAREWELL_TEST,
      [`${kotlinSources}/Legacy.kt`]: LEGACY_WITH_COMMENT,
    });
    commitBranch('violation', { [`${kotlinSources}/Bad.kt`]: BAD });
    commitBranch('java-in-kotlin-module', { 'src/main/java/demo/Danger.java': DANGER });
    commitBranch('detekt-config', {
      [`${kotlinSources}/Bad.kt`]: BAD,
      'config/detekt.yml': MAGIC_NUMBER_OFF_WITH_FORMATTING_RULESET,
    });
    commitBranch('no-formatter', { [`${kotlinSources}/Bad.kt`]: BAD }, ['.editorconfig']);
    commitBranch('ktfmt', { [`${kotlinSources}/Bad.kt`]: BAD, [`${kotlinSources}/Meta.kt`]: META });
    commitBranch('ktfmt-named', {
      'build.gradle.kts': `${readFileSync(path.join(repository, 'build.gradle.kts'), 'utf8')}\nval formatter = "com.ncorti.ktfmt.gradle"\n`,
    });
    commitBranch('broken', { [`${kotlinSources}/Broken.kt`]: BROKEN });
  });

  afterAll(() => {
    rmSync(mixedRepository, { recursive: true, force: true });
    rmSync(kotlinOnlyRepository, { recursive: true, force: true });
  });

  it('passes a tested Kotlin change and keeps the legacy detekt finding baselined when its line moves', () => {
    const result = diffOf('clean');

    expect(result.failed).toBe(false);
    expect(summarize(result.newEnforceable)).toEqual([]);
    expect(fromTool(result.newFindings, 'jacoco')).toEqual(['jacoco line-coverage Farewell.kt']);
    expect(fromTool(result.unchangedFindings, 'detekt')).toEqual(LEGACY_FINDINGS);
  });

  it('fails new detekt and ktlint findings (ktlint detected from .editorconfig) in Kotlin code', () => {
    const result = diffOf('violation');

    expect(result.failed).toBe(true);
    expect(fromTool(result.newEnforceable, 'detekt')).toEqual([...BAD_FINDINGS].sort());
    expect(ktlintRules(result.newEnforceable)).toEqual(BAD_KTLINT_RULES);
    expect(fromTool(result.unchangedFindings, 'detekt')).toEqual(LEGACY_FINDINGS);
    expect(fromTool(result.unchangedFindings, 'ktlint')).toEqual([]);
    expect(Math.min(...ktlintOf(result.newEnforceable).map(({ location }) => location.line))).toBe(
      3,
    );
  });

  it('does not lint generated sources registered from the build directory', () => {
    const result = diffOf('clean');

    expect(result.unchangedFindings.some(({ path: file }) => file.endsWith('Api.kt'))).toBe(false);
    expect(result.newFindings.some(({ path: file }) => file.endsWith('Api.kt'))).toBe(false);
  });

  it('still gates Java sources of a Kotlin module with the Java tools', () => {
    const result = diffOf('java-in-kotlin-module');

    expect(result.failed).toBe(true);
    expect(fromTool(result.newEnforceable, 'pmd')).toEqual(['pmd EmptyCatchBlock Danger.java']);
    expect(
      result.newEnforceable.filter((finding) =>
        ['detekt', 'ktlint', 'ktfmt'].includes(finding.tool),
      ),
    ).toEqual([]);
  });

  it("runs detekt with the project's config laid over the defaults", () => {
    const result = diffOf('detekt-config');

    expect(fromTool(result.newEnforceable, 'detekt')).toEqual([
      'detekt detekt.style.UnusedPrivateProperty Bad.kt',
    ]);
    expect(ktlintRules(result.newEnforceable)).toEqual(BAD_KTLINT_RULES);
  });

  it('runs no format check for a project that names no formatter', () => {
    const result = diffOf('no-formatter');

    expect(fromTool(result.newEnforceable, 'detekt')).toEqual([...BAD_FINDINGS].sort());
    expect(result.newFindings.filter(({ tool }) => ['ktlint', 'ktfmt'].includes(tool))).toEqual([]);
  });

  it('checks formatting with ktfmt when configured, accepting code in its style', () => {
    const result = diffOf('ktfmt', { preset: 'kotlin', kotlinFormatter: 'ktfmt' });

    expect(summarize(result.newEnforceable)).toEqual(
      [...BAD_FINDINGS, 'ktfmt format Bad.kt'].sort(),
    );
    expect(fromTool(result.unchangedFindings, 'ktfmt')).toEqual([
      'ktfmt format Greeter.kt',
      'ktfmt format Legacy.kt',
    ]);
  });

  it('detects ktfmt from the build files when the project names it', () => {
    git('checkout', '-q', 'ktfmt-named');
    const findings = collectJavaFindings(repository, { gradle, policy: kotlinPolicy });
    const formatters = new Set(
      findings.filter(({ rule }) => rule === 'format').map(({ tool }) => tool),
    );

    expect(formatters.has('ktfmt')).toBe(true);
    expect(formatters.has('ktlint')).toBe(false);
  });

  it('reports a Gradle failure as a tool error instead of throwing', () => {
    git('checkout', '-q', 'broken');

    const { findings } = analyzeJavaSnapshot(repository, { gradle, policy: kotlinPolicy });

    expect(findings).toEqual([
      expect.objectContaining({
        tool: 'kotlin',
        rule: 'gradle-failure',
        classification: 'tool-error',
        message: expect.stringContaining('Broken.kt'),
      }),
    ]);
  });

  it('gates a Kotlin-only module, where the Java tools have nothing to analyze', () => {
    repository = kotlinOnlyRepository;
    const result = diffOf('kotlin-only-violation');

    expect(fromTool(result.newEnforceable, 'detekt')).toEqual([...BAD_FINDINGS].sort());
    expect(ktlintRules(result.newEnforceable)).toEqual(BAD_KTLINT_RULES);
    expect(fromTool(result.unchangedFindings, 'detekt')).toEqual(LEGACY_FINDINGS);
    expect(result.newEnforceable.filter(({ tool }) => ['pmd', 'spotbugs'].includes(tool))).toEqual(
      [],
    );
  });
});
