import { describe, expect, it } from 'vitest';
import { JUNIT_HEAD, rulesOf, summaryOf } from '../../../test-support/sources.mjs';
import { RETRY_RULE } from './retry-tests.mjs';

const retries = (text) => rulesOf(text, RETRY_RULE);

describe('JVM retries in Kotlin tests', () => {
  it('reports JUnit Pioneer and rerunner-jupiter annotations and spares repeated tests', () => {
    const text = `${JUNIT_HEAD}import org.junit.jupiter.api.RepeatedTest
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
`;

    expect(retries(text)).toEqual([
      'AccountTest.pioneer@14',
      'AccountTest.rerunner@17',
      'AccountTest.qualified@20',
    ]);
  });

  it('follows an import alias of the annotation', () => {
    const text = `${JUNIT_HEAD}import org.junitpioneer.jupiter.RetryingTest as Again

class AccountTest {
    @Again(3)
    fun aliased() { assertEquals(1, 1) }
}
`;

    expect(retries(text)).toEqual(['AccountTest.aliased@12']);
  });

  it('reports a TestNG retryAnalyzer on a test or a class and spares a plain TestNG test', () => {
    const text = `package demo

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
`;

    expect(retries(text)).toEqual(['FlowTest.onMethod@6', 'WholeTest@16']);
  });

  it('reports a class or object implementing IRetryAnalyzer or extending RetryAnalyzerCount', () => {
    const text = `package demo

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
`;

    expect(retries(text)).toEqual(['Again@7', 'Counted@11', 'Holder.object@16']);
  });

  it('reports setRetryAnalyzer calls, for example in an annotation transformer', () => {
    const text = `package demo

import org.testng.IAnnotationTransformer
import org.testng.annotations.ITestAnnotation

class Everywhere : IAnnotationTransformer {
    override fun transform(annotation: ITestAnnotation?, testClass: Class<*>?) {
        annotation?.setRetryAnalyzer(Again::class.java)
    }
}
`;

    expect(retries(text)).toEqual(['Everywhere@8']);
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

  it('reports a grouped annotation', () => {
    const text = `${JUNIT_HEAD}class AccountTest {
    @[RetryingTest(3) Test]
    fun grouped() { assertEquals(1, 1) }

    @[Test]
    fun plain() { assertEquals(1, 1) }
}
`;

    expect(retries(text)).toEqual(['AccountTest@10']);
  });

  it('reports setRetryAnalyzer calls but not a declaration with that name', () => {
    const text = `package demo

class Registry {
    fun setRetryAnalyzer(attempts: Int) { }
}

fun Registry.setRetryAnalyzer(name: String) { }

fun install(registry: Registry) {
    registry.setRetryAnalyzer(1)
}
`;

    expect(retries(text)).toEqual(['top level@10']);
  });
});
