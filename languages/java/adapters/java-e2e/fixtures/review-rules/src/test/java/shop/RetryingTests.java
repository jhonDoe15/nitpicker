package shop;

import static org.assertj.core.api.Assertions.assertThat;

import io.github.artsok.RepeatedIfExceptionsTest;
import java.lang.reflect.Constructor;
import java.lang.reflect.Method;
import org.junit.jupiter.api.RepeatedTest;
import org.junit.jupiter.api.Test;
import org.junitpioneer.jupiter.RetryingTest;
import org.testng.IAnnotationTransformer;
import org.testng.IRetryAnalyzer;
import org.testng.ITestResult;
import org.testng.annotations.ITestAnnotation;
import org.testng.util.RetryAnalyzerCount;

class RetryingTests {
  @RetryingTest(3) // violation: RetryInTest
  void retriesWithPioneer() {
    assertThat(Prices.sum(java.util.List.of(1L, 2L))).isEqualTo(3L);
  }

  @RepeatedIfExceptionsTest(repeats = 3) // violation: RetryInTest
  void retriesWithRerunner() {
    assertThat(Prices.sum(java.util.List.of(1L, 2L))).isEqualTo(3L);
  }

  @org.testng.annotations.Test(retryAnalyzer = Again.class) // violation: RetryInTest
  void retriesWithTestNg() {
    assertThat(Prices.sum(java.util.List.of(1L, 2L))).isEqualTo(3L);
  }

  @org.testng.annotations.Test(groups = "fast")
  void runsOnce() {
    assertThat(Prices.sum(java.util.List.of(1L, 2L))).isEqualTo(3L);
  }

  @RepeatedTest(3)
  void everyRepetitionMustPass() {
    assertThat(Prices.sum(java.util.List.of(1L, 2L))).isEqualTo(3L);
  }

  @Test
  void runsOnceWithJUnit() {
    assertThat(Prices.sum(java.util.List.of(1L, 2L))).isEqualTo(3L);
  }

  static class Again implements IRetryAnalyzer { // violation: RetryInTest
    @Override
    public boolean retry(ITestResult result) {
      return false;
    }
  }

  static class Counted extends RetryAnalyzerCount { // violation: RetryInTest
    @Override
    public boolean retryMethod(ITestResult result) {
      return false;
    }
  }

  static class Everywhere implements IAnnotationTransformer {
    @Override
    @SuppressWarnings("rawtypes")
    public void transform(
        ITestAnnotation annotation, Class testClass, Constructor constructor, Method method) {
      annotation.setRetryAnalyzer(Again.class); // violation: RetryInTest
    }
  }

  enum Never implements IRetryAnalyzer { // violation: RetryInTest
    INSTANCE;

    @Override
    public boolean retry(ITestResult result) {
      return false;
    }
  }

  record Once(int attempts) implements IRetryAnalyzer { // violation: RetryInTest
    @Override
    public boolean retry(ITestResult result) {
      return false;
    }
  }

  static boolean never(ITestResult result) {
    return false;
  }

  final IRetryAnalyzer asLambda = result -> false; // violation: RetryInTest

  final IRetryAnalyzer asReference = RetryingTests::never; // violation: RetryInTest

  static class Registry {
    void setRetryAnalyzer(int attempts) {}
  }

  void ownMethodWithTheSameName() {
    new Registry().setRetryAnalyzer(1);
  }
}
