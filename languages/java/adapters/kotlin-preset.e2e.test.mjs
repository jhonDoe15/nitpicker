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

const SPREAD = `package demo

class Spread {
    fun one(): Int = 1

    fun length(text: String?, flag: Boolean): Int {
        val value = text
            ?: return 0
        if (
            flag
        ) {
            return value.length
        }
        return -value.length
    }
}
`;

const SPREAD_TEST = `package demo

import kotlin.test.Test
import kotlin.test.assertEquals

class SpreadTest {
    @Test
    fun countsOne() {
        assertEquals(1, Spread().one())
    }
}
`;

const OFFSET = `package demo.offset

class Offset {
    fun sign(value: Int): Int = if (value > 0) 1 else -1
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

const BAD_DETEKT_FINDINGS = [
  ...Array(6).fill('detekt detekt.style.MagicNumber Bad.kt'),
  'detekt detekt.style.UnusedPrivateProperty Bad.kt',
];

const BAD_BRANCH_FINDINGS = ['jacoco changed-branch-coverage Bad.kt'];

const BAD_FINDINGS = [...BAD_DETEKT_FINDINGS, ...BAD_BRANCH_FINDINGS];

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

const GROWN = `package demo

fun product(a: Int, b: Int, c: Int, d: Int): Int = a * b * c * d
`;

const GROWN_TEST = `package demo

import kotlin.test.Test
import kotlin.test.assertEquals

class GrownTest {
    @Test
    fun multiplies() {
        assertEquals(24, product(1, 2, 3, 4))
    }
}
`;

const GROWN_WIDER = `package demo

fun product(a: Int, b: Int, c: Int, d: Int, e: Int): Int = a * b * c * d * e
`;

const GROWN_WIDER_TEST = GROWN_TEST.replace('product(1, 2, 3, 4)', 'product(1, 2, 3, 4, 1)');

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

const classifier = (name, branches, { bump = 1, step = 10 } = {}) => `package demo

fun ${name}(value: Int): Int {
    var result = 0
${Array.from({ length: branches }, (_, index) => `    if (value > ${index * step}) {\n        result += ${index === 0 ? bump : 1}\n    }`).join('\n')}
    return result
}
`;

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

const stabilityFiles = (suffix) => ({
  [`src/main/kotlin/client${suffix}/ClientOne.kt`]: stabilityClass(
    `client${suffix}`,
    'ClientOne',
    `stable${suffix}.Core().value()`,
  ),
  [`src/main/kotlin/client${suffix}/ClientTwo.kt`]: stabilityClass(
    `client${suffix}`,
    'ClientTwo',
    `stable${suffix}.Core().value() + 1`,
  ),
  [`src/main/kotlin/stable${suffix}/Core.kt`]: stabilityClass(
    `stable${suffix}`,
    'Core',
    `churn${suffix}.Volatile().value()`,
  ),
  [`src/main/kotlin/churn${suffix}/Volatile.kt`]: stabilityClass(
    `churn${suffix}`,
    'Volatile',
    `leaf${suffix}.Leaf().value()`,
  ),
  [`src/main/kotlin/leaf${suffix}/Leaf.kt`]: stabilityClass(`leaf${suffix}`, 'Leaf', '1'),
});

const FLATTEN = `package demo

fun flatten(value: Int): Int {
    var result = 0
${Array.from({ length: 5 }, (_, index) => `    if (value > ${index * 10}) {\n        result += ${index + 1}\n    }`).join('\n')}
    return result
}
`;

const FLATTEN_TEST = `package demo

import kotlin.test.Test
import kotlin.test.assertEquals

class FlattenTest {
    @Test
    fun flattensNothing() {
        assertEquals(0, flatten(0))
    }
}
`;

const COMBINE = `package demo

val combine: (Int, Int, Int, Int) -> Int = { a, b, c, d -> a + b + c + d }
`;

const COMBINE_TEST = `package demo

import kotlin.test.Test
import kotlin.test.assertEquals

class CombineTest {
    @Test
    fun combines() {
        assertEquals(10, combine(1, 2, 3, 4))
    }
}
`;

const PIPELINE = `package demo.build

fun pipeline(a: Int, b: Int, c: Int, d: Int, e: Int): Int = a + b + c + d + e
`;

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

const HOSTILE_DETEKT_CONFIG = `formatting:
  active: true
  Indentation:
    active: true
compose:
  active: true
style:
  active: false
  excludes: ['**/*.kt']
  ForbiddenMethodCall:
    active: false
    severity: info
    excludes: ['**/*.kt']
    methods:
      - 'kotlin.io.println'
coroutines:
  active: false
potential-bugs:
  active: false
  UnsafeCallOnNullableType:
    severity: info
  CastNullableToNonNullableType:
    excludes: ['**/*.kt']
`;

const EXTRA_SOURCES = {
  'Wildcard.kt':
    'package demo.extras\n\nimport kotlinx.coroutines.*\n\nfun waitWildcard(): Int = runBlocking { 1 }\n',
  'Qualified.kt':
    'package demo.extras\n\nfun waitQualified(): Int = kotlinx.coroutines.runBlocking { 1 }\n',
  'Holder.kt': 'package demo.extras\n\nclass Holder(var count: Int)\n',
  'convention.gradle.kts': 'println("a script next to the sources")\n',
  'Hidden.kt':
    '@file:Suppress("ktlint:standard:indent")\n\npackage demo.extras\n\nval pattern = "**/*.kt"\nval maybe: String? = "a"\n\n@get:Suppress("UnsafeCallOnNullableType")\nval size: Int get() = maybe!!.length\n\n/** end */\n',
  'Compiler.kt':
    'package demo.extras\n\n@Suppress("UNCHECKED_CAST", "unused")\nfun cast(value: Any): List<String> = value as List<String>\n',
};

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

function commitBranch(name, files, removed = [], from = 'main') {
  git('checkout', '-q', '-b', name, from);
  writeAll(files);
  for (const relative of removed) {
    rmSync(path.join(repository, relative));
  }
  git('add', '-A');
  git('commit', '-q', '-m', name);
}

function commitFromStructureBase(name, files) {
  commitBranch(name, files, [], 'structure-base');
}

function initializeRepository() {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-kotlin-e2e-'));
  cpSync(path.resolve(import.meta.dirname, 'fixtures/kotlin-project'), root, { recursive: true });
  repository = root;
  writeAll({ '.gitignore': '/build/\n/.gradle/\n/.kotlin/\n' });
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
    commitBranch('one-sided-branch', {
      [`${kotlinSources}/Label.kt`]: LABEL,
      'src/test/kotlin/demo/LabelTest.kt': LABEL_ONE_SIDED_TEST,
    });
    commitBranch('multiline-branch', {
      [`${kotlinSources}/Spread.kt`]: SPREAD,
      'src/test/kotlin/demo/SpreadTest.kt': SPREAD_TEST,
      'src/main/kotlin/Offset.kt': OFFSET,
    });
    commitBranch('generated-branches', {
      [`${kotlinSources}/Generated.kt`]: GENERATED,
      'src/test/kotlin/demo/GeneratedTest.kt': GENERATED_TEST,
    });
    commitBranch('broken', { [`${kotlinSources}/Broken.kt`]: BROKEN });
    commitBranch('structure-base', {
      [`${kotlinSources}/Wide.kt`]: WIDE,
      'src/test/kotlin/demo/WideTest.kt': WIDE_TEST,
      [`${kotlinSources}/Grown.kt`]: GROWN,
      'src/test/kotlin/demo/GrownTest.kt': GROWN_TEST,
      [`${kotlinSources}/Complex.kt`]: classifier('classify', 9),
      [`${kotlinSources}/Complex2.kt`]: classifier('classify2', 9, { step: 7 }),
      ...stabilityFiles(''),
    });
    commitFromStructureBase('head', {
      [`${kotlinSources}/Wide.kt`]: WIDE_MOVED,
      [`${kotlinSources}/Grown.kt`]: GROWN_WIDER,
      'src/test/kotlin/demo/GrownTest.kt': GROWN_WIDER_TEST,
      [`${kotlinSources}/Complex.kt`]: classifier('classify', 9, { bump: 2 }),
      [`${kotlinSources}/Complex2.kt`]: classifier('classify2', 10, { step: 7 }),
      [`${kotlinSources}/Deep.kt`]: DEEP,
      'src/test/kotlin/demo/DeepTest.kt': DEEP_TEST,
      [`${kotlinSources}/Rank.kt`]: classifier('rank', 9, { step: 13 }),
      [`${kotlinSources}/Tiers.kt`]: TIERS,
      'src/test/kotlin/demo/TiersTest.kt': TIERS_TEST,
      [`${kotlinSources}/Combine.kt`]: COMBINE,
      'src/test/kotlin/demo/CombineTest.kt': COMBINE_TEST,
      'src/main/kotlin/Flatten.kt': FLATTEN,
      'src/test/kotlin/FlattenTest.kt': FLATTEN_TEST,
      [`${kotlinSources}/build/Pipeline.kt`]: PIPELINE,
      [`${kotlinSources}/Left.kt`]: clonedClass('Left'),
      [`${kotlinSources}/Right.kt`]: clonedClass('Right'),
      ...stabilityFiles('2'),
      'src/main/kotlin/stable/Core.kt': `${stabilityClass('stable', 'Core', 'churn.Volatile().value()')}\nval note = 1\n`,
    });
    commitBranch('one-way-banned', ruleFixtures('banned'));
    commitBranch('one-way-allowed', ruleFixtures('allowed'));
    commitBranch('one-way-hostile-config', {
      ...ruleFixtures('banned'),
      'config/detekt/detekt.yml': HOSTILE_DETEKT_CONFIG,
      ...Object.fromEntries(
        Object.entries(EXTRA_SOURCES).map(([name, text]) => [
          `src/main/kotlin/demo/extras/${name}`,
          text,
        ]),
      ),
    });
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
    expect(fromTool(result.newEnforceable, 'detekt')).toEqual([...BAD_DETEKT_FINDINGS].sort());
    expect(fromTool(result.newEnforceable, 'jacoco')).toEqual(BAD_BRANCH_FINDINGS);
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
    expect(fromTool(result.newEnforceable, 'jacoco')).toEqual(BAD_BRANCH_FINDINGS);
    expect(ktlintRules(result.newEnforceable)).toEqual(BAD_KTLINT_RULES);
  });

  it('runs no format check for a project that names no formatter', () => {
    const result = diffOf('no-formatter');

    expect(fromTool(result.newEnforceable, 'detekt')).toEqual([...BAD_DETEKT_FINDINGS].sort());
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

  it('fails a changed Kotlin branch that no test takes and only reports its mutants', () => {
    const result = diffOf('one-sided-branch');

    expect(result.failed).toBe(true);
    expect(fromTool(result.newEnforceable, 'jacoco')).toEqual([
      'jacoco changed-branch-coverage Label.kt',
    ]);
    expect(
      result.newEnforceable
        .filter(({ tool }) => tool === 'jacoco')
        .map(({ message, location }) => ({ message, location })),
    ).toEqual([
      {
        message:
          'Branch coverage is 50.00%; minimum is 95%. If this is intended, add {"rule":"changed-branch-coverage","paths":["src/main/kotlin/demo/Label.kt"],"function":"Label.larger","reason":"..."} to "exceptions" in nitpicker.config.json.',
        location: { line: 4 },
      },
    ]);
    expect(fromTool(result.newEnforceable, 'pit')).toEqual([]);
    expect(
      result.newFindings.filter(
        ({ tool, rule, path: file }) =>
          tool === 'pit' && rule === 'mutant-survived' && file.endsWith('Label.kt'),
      ),
    ).not.toEqual([]);
  });

  it('accepts the untested Kotlin branch of the function an exception names, and no other', () => {
    const exception = (functionName) => ({
      preset: 'kotlin',
      exceptions: [
        {
          rule: 'changed-branch-coverage',
          paths: [`${kotlinSources}/Label.kt`],
          function: functionName,
        },
      ],
    });

    const accepted = diffOf('one-sided-branch', exception('Label.larger'));
    const other = diffOf('one-sided-branch', exception('Label.smaller'));

    expect(fromTool(accepted.newEnforceable, 'jacoco')).toEqual([]);
    expect(fromTool(other.newEnforceable, 'jacoco')).toEqual([
      'jacoco changed-branch-coverage Label.kt',
    ]);
  });

  it('fails the untested branches of a statement that spans lines and of a file outside its package directory', () => {
    const result = diffOf('multiline-branch');

    expect(result.failed).toBe(true);
    expect(
      result.newEnforceable
        .filter(({ tool }) => tool === 'jacoco')
        .map(({ path: file, location }) => `${path.basename(file)}:${String(location.line)}`)
        .sort(),
    ).toEqual(['Offset.kt:4', 'Spread.kt:10', 'Spread.kt:7']);
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

    it('keeps every one-way rule on when the project config switches rulesets off, lowers severities or excludes paths, and still runs with plugin rulesets', () => {
      const result = diffOnce('one-way-hostile-config');
      const missing = kotlinRuleCases
        .filter(({ rule }) => rule !== SUPPRESSION_RULE)
        .filter(
          (testCase) =>
            !detektFindingsOf(result.newEnforceable, testCase).some(
              ({ rule }) => rule === testCase.rule,
            ),
        )
        .map(({ id }) => id);

      expect(missing).toEqual([]);
    });

    it('finds runBlocking behind a wildcard import and fully qualified, and does not ask a mutable holder class to become a data class', () => {
      const extras = diffOnce('one-way-hostile-config').newEnforceable.filter(({ path: file }) =>
        file.includes('/demo/extras/'),
      );

      expect(
        extras
          .filter(({ rule }) => rule === 'detekt.style.ForbiddenMethodCall')
          .map(({ path: file }) => path.basename(file))
          .sort(),
      ).toEqual(['Qualified.kt', 'Wildcard.kt']);
      expect(extras.some(({ rule }) => rule === 'detekt.style.UseDataClass')).toBe(false);
    });

    it('does not analyze a Kotlin script among the sources', () => {
      const result = diffOnce('one-way-hostile-config');

      expect(result.newFindings.some(({ path: file }) => file.endsWith('.kts'))).toBe(false);
      expect(result.newFindings.some(({ rule }) => rule === 'gradle-failure')).toBe(false);
    });

    it('reports the suppressions that hide a detekt or ktlint rule, however they are written, and leaves compiler warnings alone', () => {
      const result = diffOnce('one-way-hostile-config');

      const suppressions = result.newEnforceable
        .filter(({ rule, path: file }) => rule === SUPPRESSION_RULE && file.includes('/extras/'))
        .map(({ path: file, identity }) => `${path.basename(file)} ${identity}`);

      expect(suppressions.toSorted()).toEqual([
        'Hidden.kt suppress:UnsafeCallOnNullableType',
        'Hidden.kt suppress:ktlint:standard:indent',
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

  it('reports a Gradle failure as a tool error instead of throwing', () => {
    git('checkout', '-q', 'broken');

    const { findings } = analyzeJavaSnapshot(repository, { gradle, policy: kotlinPolicy });

    expect(
      findings.map(({ tool, rule, classification, message }) => ({
        tool,
        rule,
        classification,
        namesTheBrokenFile: message.includes('Broken.kt'),
      })),
    ).toEqual([
      {
        tool: 'kotlin',
        rule: 'gradle-failure',
        classification: 'tool-error',
        namesTheBrokenFile: true,
      },
    ]);
  });

  it('applies the structure, CRAP, clone and stability rules to one change', () => {
    const result = diffOf('head', kotlinPolicy, 'structure-base');
    const messageOf = (rule, symbol) =>
      onlyTools(result.newEnforceable, 'structure', 'crap').find(
        (finding) => finding.rule === rule && finding.symbol === symbol,
      ).message;

    expect(rulesOf(result.newEnforceable, 'structure', 'crap')).toEqual([
      'crap crap-score-limit Left.total',
      'crap crap-score-limit Right.total',
      'crap crap-score-limit classify2',
      'crap crap-score-limit flatten',
      'crap crap-score-limit rank',
      'structure function-control-nesting-limit depth',
      'structure function-lines-limit Left.total',
      'structure function-lines-limit Right.total',
      'structure function-parameters-limit combine',
      'structure function-parameters-limit pipeline',
      'structure function-parameters-limit product',
      'structure function-statements-limit Left.total',
      'structure function-statements-limit Right.total',
      'structure function-statements-limit classify2',
      'structure function-statements-limit rank',
    ]);
    expect(messageOf('function-control-nesting-limit', 'depth')).toBe(
      'depth nests control flow 3 deep (limit 2). Return early instead of nesting. If this is intended, add {"rule":"function-control-nesting-limit","paths":["src/main/kotlin/demo/Deep.kt"],"function":"depth","reason":"..."} to "exceptions" in nitpicker.config.json.',
    );
    expect(messageOf('function-parameters-limit', 'product')).toBe(
      'product grew from 4 to 5 parameters (limit 3). Group related parameters into one object instead of adding another. If this is intended, add {"rule":"function-parameters-limit","paths":["src/main/kotlin/demo/Grown.kt"],"function":"product","reason":"..."} to "exceptions" in nitpicker.config.json.',
    );
    expect(messageOf('crap-score-limit', 'classify2')).toBe(
      'classify2 CRAP rose from 110 to 132 (limit 9). Put new code in a new function and cover it with tests. If this is intended, add {"rule":"crap-score-limit","paths":["src/main/kotlin/demo/Complex2.kt"],"function":"classify2","reason":"..."} to "exceptions" in nitpicker.config.json.',
    );
    expect(rulesOf(result.unchangedFindings, 'structure', 'crap')).toEqual([
      'crap crap-score-limit classify',
      'structure function-parameters-limit sum',
      'structure function-statements-limit classify',
    ]);
    expect(rulesOf(result.newEnforceable, 'duplicates')).toEqual([
      'duplicates duplicate-clone Left.kt',
    ]);
    expect(
      onlyTools(result.newEnforceable, 'coupling').map(({ rule, identity, message }) => ({
        rule,
        identity,
        message,
      })),
    ).toEqual([
      {
        rule: 'stability-direction',
        identity: 'package-edge:stable2->churn2',
        message: 'stable2 depends on less stable package churn2',
      },
    ]);
    const stable = onlyTools(result.newFindings, 'coupling').find(
      ({ identity }) => identity === 'package:stable2:instability',
    );
    expect(stable.metric).toEqual({ name: 'instability', value: 0.3333 });
    expect(
      onlyTools(result.unchangedFindings, 'coupling')
        .filter(({ rule }) => rule === 'stability-direction')
        .map(({ identity }) => identity),
    ).toEqual(['package-edge:stable->churn']);
  });

  it('gates a Kotlin-only module, where the Java tools have nothing to analyze', () => {
    repository = kotlinOnlyRepository;
    const result = diffOf('kotlin-only-violation');

    expect(fromTool(result.newEnforceable, 'detekt')).toEqual([...BAD_DETEKT_FINDINGS].sort());
    expect(ktlintRules(result.newEnforceable)).toEqual(BAD_KTLINT_RULES);
    expect(fromTool(result.unchangedFindings, 'detekt')).toEqual(LEGACY_FINDINGS);
    expect(result.newEnforceable.filter(({ tool }) => ['pmd', 'spotbugs'].includes(tool))).toEqual(
      [],
    );
  });
});
