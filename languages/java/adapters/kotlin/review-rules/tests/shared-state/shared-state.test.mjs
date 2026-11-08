import { describe, expect, it } from 'vitest';
import { flagsFor, rulesOf } from '../../test-support/sources.mjs';
import { SHARED_STATE_RULE } from './shared-state.mjs';

const shared = (text, flags) => rulesOf(text, SHARED_STATE_RULE, flags);

const JUNIT = `package demo

import java.util.concurrent.atomic.AtomicInteger
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestInstance

`;

const KOTEST = `package demo

import io.kotest.core.spec.IsolationMode
import io.kotest.core.spec.style.FunSpec
import io.kotest.core.spec.style.StringSpec
import io.kotest.matchers.shouldBe

`;

describe('Kotlin state that the tests of a class share', () => {
  it('reports writes from tests to companion, top-level and per-class state', () => {
    const text = `${JUNIT}var hits = 0

class OrderTest {
    @Test
    fun counts() {
        calls++
        seen.add("a")
        totals["a"] = 1
        OrderTest.calls += 2
        Companion.seen += "b"
        hits = 3
        record("c")
    }

    @Test
    fun readsOnly() {
        val calls = mutableListOf<String>()
        calls.add("x")
        check(seen.size >= 0 && FIXED.isNotEmpty() && loaded.isNotEmpty())
        mine.add("y")
        named(calls = 1)
    }

    private fun record(value: String) {
        seen.add(value)
    }

    private fun named(calls: Int) = calls

    private val mine = mutableListOf<String>()

    companion object {
        private var calls = 0
        private val seen = mutableListOf<String>()
        private val totals = mutableMapOf<String, Int>()
        private val FIXED = listOf("a")
        private val loaded = mutableListOf<String>()

        @JvmStatic
        @BeforeAll
        fun loadOnce() {
            loaded.add("x")
        }
    }
}

@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class SingleTest {
    private val seen = ArrayList<String>()
    private var fresh = mutableListOf<String>()
    private var count = 0

    @BeforeEach
    fun start() {
        fresh = mutableListOf()
        seen.add("default")
    }

    @Test
    fun writes() {
        this.count++
        fresh.add("x")
    }
}
`;

    expect(shared(text)).toEqual([
      'OrderTest.counts@15',
      'OrderTest.counts@16',
      'OrderTest.counts@17',
      'OrderTest.counts@18',
      'OrderTest.counts@19',
      'OrderTest.counts@20',
      'OrderTest.record@34',
      'SingleTest.start@65',
      'SingleTest.writes@70',
    ]);
  });

  it('accepts state that a per-test hook assigns or clears', () => {
    const text = `${JUNIT}class ResetTest {
    @BeforeEach
    fun reset() {
        calls = 0
        counter.set(0)
        prepare()
    }

    @AfterEach
    fun clean() = seen.clear()

    private fun prepare() {
        totals.clear()
    }

    @Test
    fun writes() {
        calls++
        seen.add("a")
        counter.incrementAndGet()
        totals["a"] = 1
    }

    companion object {
        private var calls = 0
        private val seen = mutableListOf<String>()
        private val counter = AtomicInteger()
        private val totals = HashMap<String, Int>()
    }
}
`;

    expect(shared(text)).toEqual([]);
  });

  it('reports a var of a Kotest spec in the default single-instance mode', () => {
    const text = `${KOTEST}class CartSpec : FunSpec({
    var total = 0
    val items = mutableListOf<String>()
    val fixed = listOf("a")
    var fresh = mutableListOf<String>()

    beforeTest { fresh = mutableListOf() }

    test("adds") {
        total += 2
        items.add("x")
        fresh.add("y")
        fixed.size shouldBe 1
    }

    context("nested") {
        items.add("set up once")
        test("counts") {
            total++
        }
    }
})

class IsolatedSpec : StringSpec() {
    override fun isolationMode() = IsolationMode.InstancePerLeaf

    private var total = 0

    init {
        "adds" {
            total += 2
        }
    }
}
`;

    expect(shared(text)).toEqual([
      'CartSpec > adds@17',
      'CartSpec > adds@18',
      'CartSpec > nested > counts@26',
    ]);
  });

  it('follows a project-wide isolation mode in the Kotest project config', () => {
    const spec = `${KOTEST}class CartSpec : FunSpec({
    var total = 0

    test("adds") {
        total += 2
    }
})
`;
    const config = `package demo

import io.kotest.core.config.AbstractProjectConfig
import io.kotest.core.spec.IsolationMode

object ProjectConfig : AbstractProjectConfig() {
    override val isolationMode = IsolationMode.InstancePerLeaf
}
`;

    expect(shared(spec)).toEqual(['CartSpec > adds@12']);
    expect(shared(spec, flagsFor([spec, config]))).toEqual([]);
  });

  it('leaves a top-level var alone where a class property of the same name hides it', () => {
    const text = `${JUNIT}var counter = 0

class HiddenTest(private var total: Int = 0) {
    private var counter = 0

    @Test
    fun counts() {
        counter++
        total++
    }
}
`;

    expect(shared(text)).toEqual([]);
  });

  it('leaves instance state of a JUnit class and annotated properties alone', () => {
    const text = `${JUNIT}import io.mockk.impl.annotations.MockK

class PlainTest {
    private val seen = mutableListOf<String>()
    private var count = 0

    @Test
    fun writes() {
        seen.add("a")
        count++
        Mocks.recorded.add("b")
    }

    companion object {
        @MockK
        lateinit var repository: MutableList<String>
    }

    @Test
    fun usesTheMock() {
        repository.add("x")
    }
}
`;

    expect(shared(text)).toEqual([]);
  });
});
