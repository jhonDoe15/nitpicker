import { describe, expect, it } from 'vitest';
import { classesOf, functionsOf } from './declarations.mjs';
import { discoverSuites, scanTestFile, testBodies } from './test-units.mjs';

const names = (items) => items.map(({ name }) => name);
const symbols = (nodes) => nodes.map(({ symbol }) => symbol);

describe('Kotlin declarations in test sources', () => {
  it('reads classes with and without a body, with supertypes and annotations', () => {
    const scanned = scanTestFile(`@Tag("slow")
@org.junit.jupiter.api.Nested
internal data class Plain(val a: Int)
open class Child<T : Any>(val x: Int) : Base<T>(), Marker, Other by delegate {
    inner class Inner
}
interface Port
object : FunSpec({ })
val reference = Plain::class
`);

    const classes = classesOf(scanned);

    expect(names(classes)).toEqual(['Plain', 'Child', 'Inner', 'Port', 'object']);
    expect(classes[0].annotations.map(({ name, args }) => [name, args])).toEqual([
      ['Tag', '"slow"'],
      ['Nested', ''],
    ]);
    expect(classes[0].bodyOpen).toBe(-1);
    expect(classes[1].supers.map(({ name }) => name)).toEqual(['Base', 'Marker', 'Other']);
    expect(classes[1].bodyOpen).toBeGreaterThan(0);
    expect(classes[3].bodyOpen).toBe(-1);
  });

  it('reads functions with block and expression bodies, receivers, generics and backticked names', () => {
    const scanned = scanTestFile(`class A {
    @Test fun block() { call() }
    @Test fun \`reads a name\`() = runTest {
        call()
    }
    fun <T> List<T>.extension(): Int = size
    fun abstractOne()
    fun typed(): Map<String, List<Int>> {
        return emptyMap()
    }
    fun expression() =
        call(1,
            2)
    fun next() = 1
}
`);

    const functions = functionsOf(scanned);

    expect(names(functions)).toEqual([
      'block',
      'reads a name',
      'extension',
      'typed',
      'expression',
      'next',
    ]);
    const body = (fn) => scanned.code.slice(fn.body.start, fn.body.end).trim();
    expect(body(functions[1])).toBe('runTest {\n        call()\n    }');
    expect(body(functions[4])).toBe('call(1,\n            2)');
    expect(functions[5].body.expression).toBe(true);
  });

  it('ignores comments, strings and class literals when it looks for declarations', () => {
    const scanned = scanTestFile(`// class Hidden { fun hidden() {} }
val text = "class Quoted { fun quoted() {} }"
val type = String::class
class Real {
    /* @Test fun commented() {} */
    @Test fun real() { assert(true) }
}
`);

    expect(names(classesOf(scanned))).toEqual(['Real']);
    expect(names(functionsOf(scanned))).toEqual(['real']);
  });
});

describe('test discovery', () => {
  it('builds suites for JUnit classes, nested classes and every Kotest style', () => {
    const scanned = scanTestFile(`class OuterTest {
    @Test fun top() {}
    @Nested
    inner class InnerTest {
        @ParameterizedTest fun deep(value: Int) {}
    }
    fun helper() {}
}

class ShouldSpecExample : ShouldSpec({
    context("ctx") {
        should("do it") { }
        xshould("skip it") { }
    }
})

class BehaviorExample : BehaviorSpec({
    given("a") {
        \`when\`("b") {
            then("c") { }
        }
    }
    Given("d") { When("e") { Then("f") { } } }
})

class FreeExample : FreeSpec({
    "outer" - {
        "inner" { }
    }
})

class WordExample : WordSpec({
    "a thing" should {
        "work" { }
    }
    "another".config(enabled = false) { }
})

class FeatureExample : FeatureSpec({
    feature("f") { scenario("s") { } }
})

class ExpectExample : ExpectSpec({
    context("c") { expect("e") { } }
})

class PlainClass {
    fun notATest() {}
}
`);

    const suites = discoverSuites(scanned);

    expect(suites.map(({ symbol }) => symbol)).toEqual([
      'OuterTest',
      'OuterTest.InnerTest',
      'ShouldSpecExample',
      'BehaviorExample',
      'FreeExample',
      'WordExample',
      'FeatureExample',
      'ExpectExample',
    ]);
    expect(symbols(suites[0].nodes)).toEqual(['OuterTest.top']);
    expect(symbols(suites[2].nodes)).toEqual([
      'ShouldSpecExample > ctx',
      'ShouldSpecExample > ctx > do it',
      'ShouldSpecExample > ctx > skip it',
    ]);
    expect(symbols(suites[3].nodes)).toEqual([
      'BehaviorExample > a',
      'BehaviorExample > a > b',
      'BehaviorExample > a > b > c',
      'BehaviorExample > d',
      'BehaviorExample > d > e',
      'BehaviorExample > d > e > f',
    ]);
    expect(symbols(suites[4].nodes)).toEqual([
      'FreeExample > outer',
      'FreeExample > outer > inner',
    ]);
    expect(symbols(suites[5].nodes)).toEqual([
      'WordExample > a thing',
      'WordExample > a thing > work',
      'WordExample > another',
    ]);
    expect(symbols(suites[6].nodes)).toEqual(['FeatureExample > f', 'FeatureExample > f > s']);
    expect(symbols(suites[7].nodes)).toEqual(['ExpectExample > c', 'ExpectExample > c > e']);
  });

  it('reads the leaf bodies and leaves out factories and registrations built at run time', () => {
    const scanned = scanTestFile(`class MixedTest {
    @TestFactory fun dynamic() = listOf(1).map { dynamicTest("x") { } }
    @Test fun leaf() { }
}

class DynamicSpec : FunSpec({
    context("generated") {
        listOf(1, 2).forEach { test("case $it") { } }
    }
    test("static") { }
})
`);

    const bodies = testBodies(scanned, discoverSuites(scanned)).map(({ symbol }) => symbol);

    expect(bodies).toEqual(['MixedTest.leaf', 'DynamicSpec > static']);
  });

  it('reads an init block and an anonymous object spec', () => {
    const scanned = scanTestFile(`class InitSpec : FunSpec() {
    init {
        test("in init") { }
    }
}

val spec = object : FunSpec({
    test("anonymous") { }
}) {}
`);

    expect(discoverSuites(scanned).flatMap(({ nodes }) => symbols(nodes))).toEqual([
      'InitSpec > in init',
      'object > anonymous',
    ]);
  });

  it('skips a generated file', () => {
    expect(
      scanTestFile('// @generated\nclass GeneratedTest { @Test fun x() {} }\n'),
    ).toBeUndefined();
  });
});
