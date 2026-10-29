const MAIN = 'src/main/kotlin/demo/orders';
const TEST = 'src/test/kotlin/demo/orders';
const SPRING = 'src/test/kotlin/org/springframework';

const STATUS = `package demo.orders

enum class Status { NEW, PAID, SHIPPED, CANCELLED }
`;

const CLOCK = `package demo.orders

interface Clock {
    fun now(): Long
}
`;

const SETTLEMENT = `package demo.orders

fun isSettled(status: Status) = status == Status.PAID || status == Status.SHIPPED

fun isOpen(status: Status): Boolean = status in setOf(Status.NEW, Status.PAID)

fun isFinal(status: Status): Boolean =
    when (status) {
        Status.NEW, Status.PAID -> false
        Status.SHIPPED, Status.CANCELLED -> true
    }

val Status.isLive: Boolean get() = this == Status.NEW || this == Status.PAID

fun weight(status: Status) = if (status == Status.NEW || status == Status.PAID) 1 else 0

fun absOf(value: Int) = Math.abs(value)

fun total(cents: Int) = scaled(cents)

fun scaled(cents: Int): Int = cents * 2

data class Query(val tag: String, val tags: List<String>)

data class Page(val tag: String, val size: Int)
`;

const FORMATTING = `package demo.orders

private fun pad(value: Int, width: Int = 2): String = value.toString().padStart(width)

private fun label(value: Int, prefix: String = "n"): String = prefix + value

internal class Mailer(private val host: String, private val retries: Int = 3) {
    fun send(): String = host + retries
}

internal data class Envelope(val id: String, val retries: Int = 3)

fun report(): String = pad(1) + label(2) + Mailer("h").send() + label(3, "m") + Envelope("e").id
`;

const PRICING = `package demo.orders

import org.springframework.boot.context.properties.ConfigurationProperties

fun price(cents: Int, discount: Int = 0): Int = cents - discount

data class Quote(val cents: Int, val note: String = "")

@ConfigurationProperties("queue")
class QueueProperties(val name: String = "jobs", val retry: Retry = Retry()) {
    class Retry(val attempts: Int = 3, val backoffMs: Long = 500)
}

internal class Outbox(private val dir: String, private val limit: Int = 10) {
    private val log = java.util.logging.Logger.getLogger(Outbox::class.java.name)

    fun path(): String = dir + limit + log.name
}

fun quote(): String = price(100).toString() + Quote(1).cents + QueueProperties().name + Outbox("d").path()
`;

const CONFIGURATION_PROPERTIES = `package org.springframework.boot.context.properties

annotation class ConfigurationProperties(val prefix: String)
`;

const PRICING_TEST = `package demo.orders

import kotlin.test.Test
import kotlin.test.assertEquals

class PricingTest {
    @Test
    fun discounts() {
        assertEquals(90, price(100, 10))
    }
}
`;

const WAITING_TEST = `package demo.orders

import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlin.test.Test
import kotlin.test.assertEquals

class SlowClock : Clock {
    override fun now(): Long {
        Thread.sleep(1)
        return 1L
    }
}

class WaitingTest {
    @Test
    fun sleeps() {
        Thread.sleep(1)
        runBlocking { delay(1) }
        assertEquals(1L, SlowClock().now())
    }

    @Test
    fun iterates() {
        for (name in listOf("a", "b")) {
            Thread.sleep(1)
        }
        assertEquals(1L, SlowClock().now())
    }

    @Test
    fun waitsOnTheCondition() {
        var done = false
        Thread { done = true }.start()
        val deadline = System.nanoTime() + 5_000_000_000L
        while (!done && System.nanoTime() < deadline) {
            Thread.sleep(1)
        }
        runBlocking { launch { delay(1) } }
        assertEquals(true, done)
    }
}
`;

const SPRING_BOOT_TEST = `package org.springframework.boot.test.context

annotation class SpringBootTest(val webEnvironment: String = "MOCK")
`;

const AUTOWIRED = `package org.springframework.beans.factory.annotation

annotation class Autowired
`;

const CONTEXT_TEST = `package demo.orders

import kotlin.test.Test
import kotlin.test.assertEquals
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest

@SpringBootTest
class UnusedContextTest {
    @Test
    fun runs() {
        assertEquals(2, scaled(1))
    }
}

@SpringBootTest
class UsedContextTest {
    @Autowired
    private lateinit var clock: Clock

    @Test
    fun runs() {
        clock = SlowClock()
        assertEquals(1L, clock.now())
    }
}
`;

export const REVIEW_RULE_FILES = {
  [`${MAIN}/Status.kt`]: STATUS,
  [`${MAIN}/Clock.kt`]: CLOCK,
  [`${MAIN}/Settlement.kt`]: SETTLEMENT,
  [`${MAIN}/Formatting.kt`]: FORMATTING,
  [`${MAIN}/Pricing.kt`]: PRICING,
  ['src/main/kotlin/org/springframework/boot/context/properties/ConfigurationProperties.kt']:
    CONFIGURATION_PROPERTIES,
  [`${TEST}/PricingTest.kt`]: PRICING_TEST,
  [`${TEST}/WaitingTest.kt`]: WAITING_TEST,
  [`${TEST}/ContextTest.kt`]: CONTEXT_TEST,
  [`${SPRING}/boot/test/context/SpringBootTest.kt`]: SPRING_BOOT_TEST,
  [`${SPRING}/beans/factory/annotation/Autowired.kt`]: AUTOWIRED,
};

export const EXPECTED_REVIEW_FINDINGS = [
  'ExhaustiveEnumPredicate isLive',
  'ExhaustiveEnumPredicate isOpen',
  'ExhaustiveEnumPredicate isSettled',
  'ExhaustiveEnumPredicate weight',
  'FixedSleepInTest WaitingTest.iterates',
  'FixedSleepInTest WaitingTest.sleeps',
  'FixedSleepInTest WaitingTest.sleeps',
  'SingularAndPluralMember Query.tags',
  'SpringUnusedContext UnusedContextTest',
  'StaticForwardingWrapper absOf',
  'StaticForwardingWrapper total',
  'unused-option Envelope.retries',
  'unused-option Mailer.retries',
  'unused-option Outbox.limit',
  'unused-option pad.width',
  'unused-option price.discount',
];

const EMPTY_JAR = Buffer.from([0x50, 0x4b, 0x05, 0x06, ...Array.from({ length: 18 }, () => 0)]);

export function runtimeSerializationFiles(build) {
  return {
    'build.gradle.kts': `${build}
dependencies {
    runtimeOnly(files("libs/jackson-module-kotlin-2.17.2.jar"))
}
`,
    'libs/jackson-module-kotlin-2.17.2.jar': EMPTY_JAR,
  };
}

export function publishedFiles(build) {
  return {
    'build.gradle.kts': `${build.replace('kotlin("jvm") version', '`maven-publish`\n    kotlin("jvm") version')}
publishing {
    publications {
        create<MavenPublication>("library") {
            from(components["java"])
        }
    }
}
`,
  };
}

export function integrationSuiteFiles(build) {
  return {
    'build.gradle.kts': `${build}
testing {
    suites {
        register<JvmTestSuite>("integrationTest") {
            dependencies {
                implementation(project())
            }
        }
    }
}
`,
    'src/integrationTest/kotlin/demo/orders/PricingCheck.kt': `package demo.orders

object PricingCheck {
    fun discounted(): Int = price(100, 10)
}
`,
  };
}
