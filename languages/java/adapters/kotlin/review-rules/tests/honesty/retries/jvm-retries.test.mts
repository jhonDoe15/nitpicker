import { describe, expect, it } from 'vitest';
import { JUNIT_HEAD, rulesOf, summaryOf } from '../../../test-support/sources.mts';
import { RETRY_RULE } from './retry-tests.mts';

function retries(text: string): string[] {
  return rulesOf(text, RETRY_RULE);
}

const cases: { title: string; text: string; expected: string[] }[] = [
  {
    title: 'reports JUnit Pioneer and rerunner-jupiter annotations and spares repeated tests',
    text: `${JUNIT_HEAD}import org.junit.jupiter.api.RepeatedTest
import org.junitpioneer.jupiter.RetryingTest
import io.github.artsok.RepeatedIfExceptionsTest

class AccountTest {
    @RetryingTest(3)
    fun pioneer() { assertEquals(1, 1) }

    @RepeatedIfExceptionsTest(repeats = 3)
    fun rerunner() { assertEquals(1, 1) }

    @org.junitpioneer.jupiter.RetryingTest(maxAttempts = 2)
    fun qualified() { assertEquals(1, 1) }

    @RepeatedTest(5)
    fun everyRepetitionMustPass() { assertEquals(1, 1) }

    @Test
    fun plain() { assertEquals(1, 1) }
}
`,
    expected: ['AccountTest.pioneer@14', 'AccountTest.rerunner@17', 'AccountTest.qualified@20'],
  },
  {
    title: 'follows an import alias of the annotation',
    text: `${JUNIT_HEAD}import org.junitpioneer.jupiter.RetryingTest as Again

class AccountTest {
    @Again(3)
    fun aliased() { assertEquals(1, 1) }
}
`,
    expected: ['AccountTest.aliased@12'],
  },
  {
    title: 'reports a TestNG retryAnalyzer on a test or a class and spares a plain TestNG test',
    text: `package demo

import org.testng.annotations.Test

class FlowTest {
    @Test(retryAnalyzer = Again::class)
    fun onMethod() { }

    @Test(groups = ["fast"])
    fun grouped() { }

    @Test
    fun plain() { }
}

@Test(retryAnalyzer = Again::class)
class WholeTest {
    fun inside() { }
}
`,
    expected: ['FlowTest.onMethod@6', 'WholeTest@16'],
  },
  {
    title: 'reports a class or object implementing IRetryAnalyzer or extending RetryAnalyzerCount',
    text: `package demo

import org.testng.IRetryAnalyzer
import org.testng.ITestResult
import org.testng.util.RetryAnalyzerCount

class Again : IRetryAnalyzer {
    override fun retry(result: ITestResult): Boolean = false
}

class Counted : RetryAnalyzerCount() {
    override fun retryMethod(result: ITestResult): Boolean = false
}

class Holder {
    val inline = object : IRetryAnalyzer {
        override fun retry(result: ITestResult): Boolean = false
    }
}

class Unrelated : Runnable {
    override fun run() { }
}
`,
    expected: ['Again@7', 'Counted@11', 'Holder.object@16'],
  },
  {
    title: 'reports setRetryAnalyzer calls, for example in an annotation transformer',
    text: `package demo

import org.testng.IAnnotationTransformer
import org.testng.annotations.ITestAnnotation

class Everywhere : IAnnotationTransformer {
    override fun transform(annotation: ITestAnnotation?, testClass: Class<*>?) {
        annotation?.setRetryAnalyzer(Again::class.java)
    }
}
`,
    expected: ['Everywhere@8'],
  },
  {
    title: 'reports a grouped annotation',
    text: `${JUNIT_HEAD}class AccountTest {
    @[RetryingTest(3) Test]
    fun grouped() { assertEquals(1, 1) }

    @[Test]
    fun plain() { assertEquals(1, 1) }
}
`,
    expected: ['AccountTest@10'],
  },
  {
    title: 'reports setRetryAnalyzer calls but not a declaration with that name',
    text: `package demo

class Registry {
    fun setRetryAnalyzer(attempts: Int) { }
}

fun Registry.setRetryAnalyzer(name: String) { }

fun install(registry: Registry) {
    registry.setRetryAnalyzer(1)
}
`,
    expected: ['top level@10'],
  },
];

describe('JVM retries in Kotlin tests', () => {
  it.each(cases)('$title', ({ text, expected }) => {
    expect(retries(text)).toEqual(expected);
  });

  it('keeps ordinary tests and names that only look like retries', () => {
    const text = `${JUNIT_HEAD}class AccountTest {
    @Test
    fun retryAnalyzerNameInText() {
        val retryAnalyzer = "none"
        assertEquals("none", retryAnalyzer)
    }
}
`;

    expect(summaryOf(text)).toEqual([]);
  });
});
