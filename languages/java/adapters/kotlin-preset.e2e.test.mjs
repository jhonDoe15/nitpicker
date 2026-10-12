import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { collectJavaFindings, runJavaDiff } from './java-diff.mjs';
import { analyzeJavaSnapshot } from './java-runner.mjs';
import {
  expectedMessage,
  fixturePath,
  fixtureSource,
  kotlinRuleCases,
} from './fixtures/kotlin-rules/cases.mjs';
import { addOneWayHint, SUPPRESSION_RULE } from './kotlin-rules.mjs';

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

const LABEL = `package demo

class Label {
    fun larger(first: Int, second: Int): String = if (first > second) "first" else "second"
}
`;

const LABEL_ONE_SIDED_TEST = `package demo

import kotlin.test.Test
import kotlin.test.assertEquals

class LabelTest {
    @Test
    fun saysSecond() {
        assertEquals("second", Label().larger(1, 2))
    }
}
`;

const GENERATED = `package demo

enum class Level { LOW, HIGH }

sealed interface Token

data class Word(val text: String) : Token

data object Stop : Token

class Generated {
    lateinit var tag: String

    fun describe(level: Level): String =
        when (level) {
            Level.LOW -> "low"
            Level.HIGH -> "high"
        }

    fun kind(token: Token): String =
        when (token) {
            is Word -> token.text
            Stop -> "stop"
        }

    fun shout(text: String, suffix: String = "!"): String = text.uppercase() + suffix

    fun forced(text: String?): Int = text!!.length

    fun tagged(): String = tag

    fun counted(): List<Int> =
        sequence {
            yield(1)
            yield(2)
        }.toList()
}
`;

const GENERATED_TEST = `package demo

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class GeneratedTest {
    private val generated = Generated()

    @Test
    fun coversEveryBranchTheAuthorWrote() {
        assertEquals("low", generated.describe(Level.LOW))
        assertEquals("high", generated.describe(Level.HIGH))
        assertEquals("hi", generated.kind(Word("hi")))
        assertEquals("stop", generated.kind(Stop))
        assertEquals("A!", generated.shout("a"))
        assertEquals("A?", generated.shout("a", "?"))
        assertEquals(2, generated.forced("ab"))
        assertFailsWith<NullPointerException> { generated.forced(null) }
        generated.tag = "t"
        assertEquals("t", generated.tagged())
        assertEquals(listOf(1, 2), generated.counted())
    }
}
`;

const BROKEN = 'package demo\n\nclass Broken {\n    fun incomplete(: Int\n}\n';

const MAGIC_NUMBER_OFF = `style:
  MagicNumber:
    active: false
`;

const BAD_FINDINGS = [
  ...Array(6).fill('detekt detekt.style.MagicNumber Bad.kt'),
  'detekt detekt.style.UnusedPrivateProperty Bad.kt',
  'jacoco changed-branch-coverage Bad.kt',
];

const LEGACY_FINDINGS = [
  'detekt detekt.style.FunctionOnlyReturningConstant Legacy.kt',
  'detekt detekt.style.UnusedPrivateProperty Legacy.kt',
];

const ruleFixtures = (variant) =>
  Object.fromEntries(
    kotlinRuleCases.map((testCase) => [
      fixturePath(testCase, variant),
      fixtureSource(testCase, variant),
    ]),
  );

const detektFindingsOf = (findings, testCase) =>
  findings.filter(
    ({ tool, path: file }) => tool === 'detekt' && file.includes(`/demo/${testCase.id}/`),
  );

const USE_DATA_CLASS_OFF = `style:
  UseDataClass:
    active: false
`;

const WIDE = `package demo

fun sum(a: Int, b: Int, c: Int, d: Int): Int = a + b + c + d
`;

const WIDE_TEST = `package demo

import kotlin.test.Test
import kotlin.test.assertEquals

class WideTest {
    @Test
    fun sums() {
        assertEquals(10, sum(1, 2, 3, 4))
    }
}
`;

const WIDE_MOVED = `package demo

val answer = 1

fun sum(a: Int, b: Int, c: Int, d: Int): Int = a + b + c + d
`;

const WIDE_GROWN = `package demo

fun sum(a: Int, b: Int, c: Int, d: Int, e: Int): Int = a + b + c + d + e
`;

const WIDE_GROWN_TEST = WIDE_TEST.replace('sum(1, 2, 3, 4)', 'sum(1, 2, 3, 4, 0)');

const DEEP = `package demo

fun depth(values: List<Int>): Int {
    var found = 0
    for (value in values) {
        if (value > 1) {
            while (found < value) {
                found += 1
            }
        }
    }
    return found
}
`;

const DEEP_TEST = `package demo

import kotlin.test.Test
import kotlin.test.assertEquals

class DeepTest {
    @Test
    fun finds() {
        assertEquals(3, depth(listOf(0, 3)))
    }
}
`;

const classifier = (branches, bump = 1) => `package demo

fun classify(value: Int): Int {
    var result = 0
${Array.from({ length: branches }, (_, index) => `    if (value > ${index * 10}) {\n        result += ${index === 0 ? bump : 1}\n    }`).join('\n')}
    return result
}
`;

const RANK = classifier(9).replace('classify', 'rank');

const TIERS = `package demo

fun tier(value: Int, step: Int = 10): String {
    if (value > step * 3) {
        return "high"
    }
    if (value > step * 2) {
        return "medium"
    }
    return "low"
}

fun String.shout(): String = this.uppercase()

class Counter(private val start: Int) {
    constructor() : this(0) {
        println("default")
    }

    val doubled: Int
        get() = start * 2

    fun bump(by: Int = 1): Int {
        val values = listOf(1, 2, 3).map { v -> if (v > by) v else by }
        return values.sum() + start
    }

    companion object {
        fun create(): Counter = Counter(1)
    }
}
`;

const TIERS_TEST = `package demo

import kotlin.test.Test
import kotlin.test.assertEquals

class TiersTest {
    @Test
    fun tiers() {
        assertEquals("high", tier(100, 10))
        assertEquals("medium", tier(25, 10))
        assertEquals("low", tier(1, 10))
        assertEquals("HI", "hi".shout())
    }

    @Test
    fun counter() {
        val counter = Counter()
        assertEquals(0, counter.doubled)
        assertEquals(6, counter.bump())
        assertEquals(1, Counter.create().doubled / 2)
    }
}
`;

const clonedClass = (name) => `package demo

class ${name} {
    fun total(a: Int, b: Int): Int {
        var total = 0
${Array.from({ length: 12 }, (_, index) => `        total += (a * ${index + 2}) + (b - ${index})\n        if (total > ${index * 10}) {\n            total -= ${index + 1}\n        }`).join('\n')}
        return total
    }
}
`;

const stabilityClass = (packageName, name, body) => `package ${packageName}

class ${name} {
    fun value(): Int = ${body}
}
`;

const STABILITY_FILES = {
  'src/main/kotlin/client/ClientOne.kt': stabilityClass(
    'client',
    'ClientOne',
    'stable.Core().value()',
  ),
  'src/main/kotlin/client/ClientTwo.kt': stabilityClass(
    'client',
    'ClientTwo',
    'stable.Core().value() + 1',
  ),
  'src/main/kotlin/stable/Core.kt': stabilityClass('stable', 'Core', 'churn.Volatile().value()'),
  'src/main/kotlin/churn/Volatile.kt': stabilityClass('churn', 'Volatile', 'leaf.Leaf().value()'),
  'src/main/kotlin/leaf/Leaf.kt': stabilityClass('leaf', 'Leaf', '1'),
};

let repository;

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

function commitBranch(name, files, from = 'main') {
  git('checkout', '-q', '-b', name, from);
  writeAll(files);
  git('add', '-A');
  git('commit', '-q', '-m', name);
}

function commitFromStructureBase(name, files) {
  commitBranch(name, files, 'structure-base');
}

const summarize = (findings) =>
  findings.map(({ tool, rule, path: file }) => `${tool} ${rule} ${path.basename(file)}`).sort();

const fromTool = (findings, tool) => summarize(findings.filter((finding) => finding.tool === tool));

const diffOf = (branch, policy = kotlinPolicy, base = 'main') => {
  git('checkout', '-q', branch);
  return runJavaDiff({ repositoryRoot: repository, requestedBaseRef: base, gradle, policy });
};

const onlyTools = (findings, ...tools) => findings.filter(({ tool }) => tools.includes(tool));
const rulesOf = (findings, ...tools) =>
  onlyTools(findings, ...tools)
    .map(({ tool, rule, symbol, path: file }) =>
      [tool, rule, symbol ?? path.basename(file)].join(' '),
    )
    .sort();

describe.skipIf(!enabled)('Kotlin preset end to end', () => {
  beforeAll(() => {
    repository = mkdtempSync(path.join(tmpdir(), 'nitpicker-kotlin-e2e-'));
    cpSync(path.resolve(import.meta.dirname, 'fixtures/kotlin-project'), repository, {
      recursive: true,
    });
    writeAll({ '.gitignore': 'build/\n.gradle/\n.kotlin/\n' });
    git('init', '-q', '-b', 'main');
    git('add', '-A');
    git('commit', '-q', '-m', 'base with one legacy detekt finding');
    commitBranch('clean', {
      [`${kotlinSources}/Farewell.kt`]: FAREWELL,
      'src/test/kotlin/demo/FarewellTest.kt': FAREWELL_TEST,
      [`${kotlinSources}/Legacy.kt`]: LEGACY_WITH_COMMENT,
    });
    commitBranch('violation', { [`${kotlinSources}/Bad.kt`]: BAD });
    commitBranch('java-in-kotlin-module', { 'src/main/java/demo/Danger.java': DANGER });
    commitBranch('detekt-config', {
      [`${kotlinSources}/Bad.kt`]: BAD,
      'config/detekt/detekt.yml': MAGIC_NUMBER_OFF,
    });
    commitBranch('ktfmt', { [`${kotlinSources}/Bad.kt`]: BAD, [`${kotlinSources}/Meta.kt`]: META });
    commitBranch('ktfmt-named', {
      'build.gradle.kts': `${readFileSync(path.join(repository, 'build.gradle.kts'), 'utf8')}\nval formatter = "com.ncorti.ktfmt.gradle"\n`,
    });
    commitBranch('one-sided-branch', {
      [`${kotlinSources}/Label.kt`]: LABEL,
      'src/test/kotlin/demo/LabelTest.kt': LABEL_ONE_SIDED_TEST,
    });
    commitBranch('generated-branches', {
      [`${kotlinSources}/Generated.kt`]: GENERATED,
      'src/test/kotlin/demo/GeneratedTest.kt': GENERATED_TEST,
    });
    commitBranch('broken', { [`${kotlinSources}/Broken.kt`]: BROKEN });
    commitBranch('one-way-banned', ruleFixtures('banned'));
    commitBranch('one-way-allowed', ruleFixtures('allowed'));
    commitBranch('one-way-config', {
      ...ruleFixtures('banned'),
      'config/detekt/detekt.yml': USE_DATA_CLASS_OFF,
    });
    commitBranch('structure-base', {
      [`${kotlinSources}/Wide.kt`]: WIDE,
      'src/test/kotlin/demo/WideTest.kt': WIDE_TEST,
      [`${kotlinSources}/Complex.kt`]: classifier(9),
    });
    commitFromStructureBase('structure-new', {
      [`${kotlinSources}/Wide.kt`]: WIDE_MOVED,
      [`${kotlinSources}/Deep.kt`]: DEEP,
      'src/test/kotlin/demo/DeepTest.kt': DEEP_TEST,
    });
    commitFromStructureBase('structure-grown', {
      [`${kotlinSources}/Wide.kt`]: WIDE_GROWN,
      'src/test/kotlin/demo/WideTest.kt': WIDE_GROWN_TEST,
    });
    commitFromStructureBase('legacy-edited', { [`${kotlinSources}/Complex.kt`]: classifier(9, 2) });
    commitFromStructureBase('legacy-worse', { [`${kotlinSources}/Complex.kt`]: classifier(10) });
    commitFromStructureBase('crap', {
      [`${kotlinSources}/Rank.kt`]: RANK,
      [`${kotlinSources}/Tiers.kt`]: TIERS,
      'src/test/kotlin/demo/TiersTest.kt': TIERS_TEST,
    });
    commitFromStructureBase('clone', {
      [`${kotlinSources}/Left.kt`]: clonedClass('Left'),
      [`${kotlinSources}/Right.kt`]: clonedClass('Right'),
    });
    commitFromStructureBase('stability', STABILITY_FILES);
    commitBranch(
      'stability-edited',
      {
        'src/main/kotlin/stable/Core.kt': `${stabilityClass('stable', 'Core', 'churn.Volatile().value()')}\nval note = 1\n`,
      },
      'stability',
    );
  });

  afterAll(() => {
    rmSync(repository, { recursive: true, force: true });
  });

  it('passes a tested Kotlin change and keeps the legacy detekt finding baselined when its line moves', () => {
    const result = diffOf('clean');

    expect(result.failed).toBe(false);
    expect(summarize(result.newEnforceable)).toEqual([]);
    expect(fromTool(result.newFindings, 'jacoco')).toEqual(['jacoco line-coverage Farewell.kt']);
    expect(fromTool(result.unchangedFindings, 'detekt')).toEqual(LEGACY_FINDINGS);
  });

  it('fails new detekt findings and an unformatted file (ktlint is the default) in Kotlin code', () => {
    const result = diffOf('violation');

    expect(result.failed).toBe(true);
    expect(summarize(result.newEnforceable)).toEqual(
      [...BAD_FINDINGS, 'ktlint format Bad.kt'].sort(),
    );
    expect(fromTool(result.unchangedFindings, 'detekt')).toEqual(LEGACY_FINDINGS);
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

    expect(summarize(result.newEnforceable)).toEqual([
      'detekt detekt.style.UnusedPrivateProperty Bad.kt',
      'jacoco changed-branch-coverage Bad.kt',
      'ktlint format Bad.kt',
    ]);
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

  describe('one-way rules', () => {
    const results = new Map();
    const diffOnce = (branch) => {
      if (!results.has(branch)) {
        results.set(branch, diffOf(branch));
      }
      return results.get(branch);
    };

    it.each(kotlinRuleCases.map((testCase) => [testCase.id, testCase]))(
      'fails the banned form %s with a message that names the allowed form',
      (_id, testCase) => {
        const result = diffOnce('one-way-banned');
        const found = detektFindingsOf(result.newEnforceable, testCase).filter(
          ({ rule }) => rule === testCase.rule,
        );

        expect(found.length, summarize(result.newEnforceable).join('\n')).toBeGreaterThan(0);
        for (const finding of found) {
          expect(finding.message.toLowerCase()).toContain(testCase.allowedForm.toLowerCase());
        }
      },
    );

    it('reports the detekt message each case records and the hint that the gate adds', () => {
      const result = diffOnce('one-way-banned');

      for (const testCase of kotlinRuleCases.filter(({ rule }) => rule !== SUPPRESSION_RULE)) {
        const [finding] = detektFindingsOf(result.newEnforceable, testCase).filter(
          ({ rule }) => rule === testCase.rule,
        );
        const recorded = addOneWayHint({
          tool: 'detekt',
          rule: testCase.rule,
          message: expectedMessage(testCase, 'banned'),
        });

        expect(finding.message).toBe(recorded.message);
      }
    });

    it('lets the allowed form of every case through detekt', () => {
      const result = diffOnce('one-way-allowed');

      expect(fromTool(result.newEnforceable, 'detekt')).toEqual([]);
    });

    it('does not report the suppressed finding twice: the suppression is the finding', () => {
      const result = diffOnce('one-way-banned');
      const suppression = kotlinRuleCases.find(({ rule }) => rule === SUPPRESSION_RULE);

      expect(detektFindingsOf(result.newEnforceable, suppression).map(({ rule }) => rule)).toEqual([
        SUPPRESSION_RULE,
      ]);
    });

    it('keeps a one-way rule on when the project switches it off in its detekt config', () => {
      const result = diffOnce('one-way-config');
      const record = kotlinRuleCases.find(({ id }) => id === 'recordClass');

      expect(detektFindingsOf(result.newEnforceable, record).map(({ rule }) => rule)).toEqual([
        record.rule,
      ]);
    });

    it('lifts a rule for the paths of an exception in nitpicker.config.json only', () => {
      git('checkout', '-q', 'one-way-banned');
      const exception = (testCase) => ({
        rule: testCase.rule,
        glob: fixturePath(testCase, 'banned'),
      });
      const [scopeRun, scopeWith] = ['scopeRun', 'scopeWith'].map((id) =>
        kotlinRuleCases.find((testCase) => testCase.id === id),
      );
      const result = runJavaDiff({
        repositoryRoot: repository,
        requestedBaseRef: 'main',
        gradle,
        policy: { ...kotlinPolicy, exceptions: [exception(scopeRun)] },
      });

      expect(detektFindingsOf(result.newEnforceable, scopeRun)).toEqual([]);
      expect(detektFindingsOf(result.newEnforceable, scopeWith)).toHaveLength(1);
    });
  });

  it('fails a changed Kotlin branch that no test takes and only reports its mutants', () => {
    const result = diffOf('one-sided-branch');

    expect(result.failed).toBe(true);
    expect(fromTool(result.newEnforceable, 'jacoco')).toEqual([
      'jacoco changed-branch-coverage Label.kt',
    ]);
    expect(result.newEnforceable.find(({ tool }) => tool === 'jacoco')).toEqual(
      expect.objectContaining({
        message: 'Branch coverage is 50.00%; minimum is 95%',
        location: { line: 4 },
      }),
    );
    expect(fromTool(result.newEnforceable, 'pit')).toEqual([]);
    expect(
      result.newFindings.filter(
        ({ tool, rule, path: file }) =>
          tool === 'pit' && rule === 'mutant-survived' && file.endsWith('Label.kt'),
      ),
    ).not.toEqual([]);
  });

  it('does not ask for coverage of branches the Kotlin compiler generated', () => {
    git('checkout', '-q', 'generated-branches');
    const findings = collectJavaFindings(repository, { gradle, policy: kotlinPolicy });
    const report = readFileSync(path.join(repository, 'build/nitpicker/jacoco.xml'), 'utf8');
    const generatedFile = report.slice(report.indexOf('<sourcefile name="Generated.kt">'));
    const missedLines = [...generatedFile.matchAll(/<line nr="(\d+)"[^>]* mb="([1-9]\d*)"/g)].map(
      ([, line]) => Number(line),
    );

    expect(missedLines.length).toBeGreaterThan(0);
    expect(findings.filter(({ rule }) => rule === 'changed-branch-coverage')).toEqual([]);
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

  it('fails a new function over the nesting limit and keeps a legacy wide function baselined when it moves', () => {
    const result = diffOf('structure-new', kotlinPolicy, 'structure-base');

    expect(rulesOf(result.newEnforceable, 'structure')).toEqual([
      'structure function-control-nesting-limit depth',
    ]);
    expect(onlyTools(result.newEnforceable, 'structure')[0].message).toBe(
      'depth nests control flow 3 deep (limit 2). Return early instead of nesting.',
    );
    expect(rulesOf(result.unchangedFindings, 'structure')).toEqual([
      'structure function-parameters-limit sum',
      'structure function-statements-limit classify',
    ]);
    expect(rulesOf(result.newEnforceable, 'crap')).toEqual([]);
  });

  it('fails a touched function that grows past a structure limit it already exceeded', () => {
    const result = diffOf('structure-grown', kotlinPolicy, 'structure-base');

    expect(rulesOf(result.newEnforceable, 'structure')).toEqual([
      'structure function-parameters-limit sum',
    ]);
    expect(onlyTools(result.newEnforceable, 'structure')[0].message).toBe(
      'sum grew from 4 to 5 parameters (limit 3). Group related parameters into one object instead of adding another.',
    );
  });

  it('lets a touched legacy function pass when none of its limits got worse', () => {
    const result = diffOf('legacy-edited', kotlinPolicy, 'structure-base');

    expect(rulesOf(result.newEnforceable, 'structure', 'crap')).toEqual([]);
    expect(rulesOf(result.unchangedFindings, 'structure', 'crap')).toEqual([
      'crap crap-score-limit classify',
      'structure function-parameters-limit sum',
      'structure function-statements-limit classify',
    ]);
  });

  it('fails a legacy function whose statements and CRAP score rise', () => {
    const result = diffOf('legacy-worse', kotlinPolicy, 'structure-base');

    expect(rulesOf(result.newEnforceable, 'structure', 'crap')).toEqual([
      'crap crap-score-limit classify',
      'structure function-statements-limit classify',
    ]);
    expect(onlyTools(result.newEnforceable, 'crap')[0].message).toBe(
      'classify CRAP rose from 110 to 132 (limit 9). Put new code in a new function and cover it with tests.',
    );
  });

  it('measures CRAP on file facades, classes, accessors, lambdas and default arguments', () => {
    const result = diffOf('crap', kotlinPolicy, 'structure-base');

    expect(rulesOf(result.newEnforceable, 'crap')).toEqual(['crap crap-score-limit rank']);
    expect(rulesOf(result.newEnforceable, 'structure')).toEqual([
      'structure function-statements-limit rank',
    ]);
  });

  it('fails a new Kotlin clone found by jscpd', () => {
    const result = diffOf('clone', kotlinPolicy, 'structure-base');

    expect(rulesOf(result.newEnforceable, 'duplicates')).toEqual([
      'duplicates duplicate-clone Left.kt',
    ]);
  });

  it('fails a package depending on a less stable package, read from the bytecode of Kotlin files', () => {
    const result = diffOf('stability', kotlinPolicy, 'structure-base');

    expect(
      onlyTools(result.newEnforceable, 'coupling').map(({ rule, identity, message }) => ({
        rule,
        identity,
        message,
      })),
    ).toEqual([
      {
        rule: 'stability-direction',
        identity: 'package-edge:stable->churn',
        message: 'stable depends on less stable package churn',
      },
    ]);
    const stable = onlyTools(result.newFindings, 'coupling').find(
      ({ identity }) => identity === 'package:stable:instability',
    );
    expect(stable.metric).toEqual({ name: 'instability', value: 0.3333 });
  });

  it('keeps an existing stability-direction violation baselined when the package is edited', () => {
    const result = diffOf('stability-edited', kotlinPolicy, 'stability');

    expect(onlyTools(result.newFindings, 'coupling')).toEqual([]);
    expect(
      onlyTools(result.unchangedFindings, 'coupling')
        .filter(({ rule }) => rule === 'stability-direction')
        .map(({ identity }) => identity),
    ).toEqual(['package-edge:stable->churn']);
  });
});
