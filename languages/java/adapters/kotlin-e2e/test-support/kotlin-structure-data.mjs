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

export function classifier(name, branches, { bump = 1, step = 10 } = {}) {
  return `package demo

fun ${name}(value: Int): Int {
    var result = 0
${Array.from({ length: branches }, (_, index) => `    if (value > ${index * step}) {\n        result += ${index === 0 ? bump : 1}\n    }`).join('\n')}
    return result
}
`;
}

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

export function clonedClass(name) {
  return `package demo

class ${name} {
    fun total(a: Int, b: Int): Int {
        var total = 0
${Array.from({ length: 12 }, (_, index) => `        total += (a * ${index + 2}) + (b - ${index})\n        if (total > ${index * 10}) {\n            total -= ${index + 1}\n        }`).join('\n')}
        return total
    }
}
`;
}

export function stabilityClass(packageName, name, body) {
  return `package ${packageName}

class ${name} {
    fun value(): Int = ${body}
}
`;
}

export function stabilityFiles(suffix) {
  return {
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
  };
}

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
