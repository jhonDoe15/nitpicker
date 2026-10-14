export const FAREWELL = `package demo

class Farewell {
    fun goodbye(name: String): String = "Goodbye, $name."
}
`;

export const FAREWELL_TEST = `package demo

import kotlin.test.Test
import kotlin.test.assertEquals

class FarewellTest {
    @Test
    fun saysFarewell() {
        assertEquals("Goodbye, Ada.", Farewell().goodbye("Ada"))
    }
}
`;

export const LEGACY_WITH_COMMENT = `package demo

class Legacy {
    // Kept for compatibility.
    private val leftover = 1

    fun value(): Int = 1
}
`;

export const BAD = `package demo

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

export const META = `package demo

class Meta {
  fun label(name: String): String = "Meta, $name!"
}
`;

export const DANGER = `package demo;

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

export const LABEL = `package demo

class Label {
    fun larger(first: Int, second: Int): String = if (first > second) "first" else "second"
}
`;

export const LABEL_ONE_SIDED_TEST = `package demo

import kotlin.test.Test
import kotlin.test.assertEquals

class LabelTest {
    @Test
    fun saysSecond() {
        assertEquals("second", Label().larger(1, 2))
    }
}
`;

export const SPREAD = `package demo

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

export const SPREAD_TEST = `package demo

import kotlin.test.Test
import kotlin.test.assertEquals

class SpreadTest {
    @Test
    fun countsOne() {
        assertEquals(1, Spread().one())
    }
}
`;

export const OFFSET = `package demo.offset

class Offset {
    fun sign(value: Int): Int = if (value > 0) 1 else -1
}
`;

export const GENERATED = `package demo

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

export const GENERATED_TEST = `package demo

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

export const BROKEN = 'package demo\n\nclass Broken {\n    fun incomplete(: Int\n}\n';

export const MAGIC_NUMBER_OFF_WITH_FORMATTING_RULESET = `formatting:
  active: true
style:
  MagicNumber:
    active: false
`;

export const GREETER_TEST_WITHOUT_JAVA = `package demo

import kotlin.test.Test
import kotlin.test.assertEquals

class GreeterTest {
    @Test
    fun greetsByName() {
        assertEquals("Hello, Ada!", Greeter().greet("Ada"))
    }
}
`;

export const BAD_DETEKT_FINDINGS = [
  ...Array(6).fill('detekt detekt.style.MagicNumber Bad.kt'),
  'detekt detekt.style.UnusedPrivateProperty Bad.kt',
];

export const BAD_BRANCH_FINDINGS = ['jacoco changed-branch-coverage Bad.kt'];

export const BAD_FINDINGS = [...BAD_DETEKT_FINDINGS, ...BAD_BRANCH_FINDINGS];

export const BAD_KTLINT_RULES = [
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

export const LEGACY_FINDINGS = [
  'detekt detekt.style.FunctionOnlyReturningConstant Legacy.kt',
  'detekt detekt.style.UnusedPrivateProperty Legacy.kt',
];

export const WIDE = `package demo

fun sum(a: Int, b: Int, c: Int, d: Int): Int = a + b + c + d
`;

export const WIDE_TEST = `package demo

import kotlin.test.Test
import kotlin.test.assertEquals

class WideTest {
    @Test
    fun sums() {
        assertEquals(10, sum(1, 2, 3, 4))
    }
}
`;

export const WIDE_MOVED = `package demo

val answer = 1

fun sum(a: Int, b: Int, c: Int, d: Int): Int = a + b + c + d
`;

export const GROWN = `package demo

fun product(a: Int, b: Int, c: Int, d: Int): Int = a * b * c * d
`;

export const GROWN_TEST = `package demo

import kotlin.test.Test
import kotlin.test.assertEquals

class GrownTest {
    @Test
    fun multiplies() {
        assertEquals(24, product(1, 2, 3, 4))
    }
}
`;

export const GROWN_WIDER = `package demo

fun product(a: Int, b: Int, c: Int, d: Int, e: Int): Int = a * b * c * d * e
`;

export const GROWN_WIDER_TEST = GROWN_TEST.replace('product(1, 2, 3, 4)', 'product(1, 2, 3, 4, 1)');

export const DEEP = `package demo

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

export const DEEP_TEST = `package demo

import kotlin.test.Test
import kotlin.test.assertEquals

class DeepTest {
    @Test
    fun finds() {
        assertEquals(3, depth(listOf(0, 3)))
    }
}
`;

export const classifier = (name, branches, { bump = 1, step = 10 } = {}) => `package demo

fun ${name}(value: Int): Int {
    var result = 0
${Array.from({ length: branches }, (_, index) => `    if (value > ${index * step}) {\n        result += ${index === 0 ? bump : 1}\n    }`).join('\n')}
    return result
}
`;

export const TIERS = `package demo

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

export const TIERS_TEST = `package demo

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

export const clonedClass = (name) => `package demo

class ${name} {
    fun total(a: Int, b: Int): Int {
        var total = 0
${Array.from({ length: 12 }, (_, index) => `        total += (a * ${index + 2}) + (b - ${index})\n        if (total > ${index * 10}) {\n            total -= ${index + 1}\n        }`).join('\n')}
        return total
    }
}
`;

export const stabilityClass = (packageName, name, body) => `package ${packageName}

class ${name} {
    fun value(): Int = ${body}
}
`;

export const stabilityFiles = (suffix) => ({
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

export const FLATTEN = `package demo

fun flatten(value: Int): Int {
    var result = 0
${Array.from({ length: 5 }, (_, index) => `    if (value > ${index * 10}) {\n        result += ${index + 1}\n    }`).join('\n')}
    return result
}
`;

export const FLATTEN_TEST = `package demo

import kotlin.test.Test
import kotlin.test.assertEquals

class FlattenTest {
    @Test
    fun flattensNothing() {
        assertEquals(0, flatten(0))
    }
}
`;

export const COMBINE = `package demo

val combine: (Int, Int, Int, Int) -> Int = { a, b, c, d -> a + b + c + d }
`;

export const COMBINE_TEST = `package demo

import kotlin.test.Test
import kotlin.test.assertEquals

class CombineTest {
    @Test
    fun combines() {
        assertEquals(10, combine(1, 2, 3, 4))
    }
}
`;

export const PIPELINE = `package demo.build

fun pipeline(a: Int, b: Int, c: Int, d: Int, e: Int): Int = a + b + c + d + e
`;

export const HOSTILE_DETEKT_CONFIG = `formatting:
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

export const EXTRA_SOURCES = {
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
