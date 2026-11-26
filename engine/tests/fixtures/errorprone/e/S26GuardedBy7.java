package e;

import com.google.errorprone.annotations.concurrent.GuardedBy;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.function.Predicate;

// test: methodReference_referencedMethodIsFlagged

class Test_edby73 {
  private final List<Predicate<String>> preds = new ArrayList<>();

  public synchronized void test() {
    Optional.of("foo").ifPresent(this::frobnicate);
    // BUG: Diagnostic contains: should be guarded by
    preds.add(this::frobnicate);
  }

  @GuardedBy("this")
  public boolean frobnicate(String x) {
    return true;
  }
}

// test: lambdaMethodInvokedImmediately_shouldNotBeFlagged

class Test_edby74 {
  @GuardedBy("this")
  private final Object o = new Object();

  public synchronized void test(List<?> xs) {
    xs.forEach(x -> o.toString());
  }
}

// test: bindingVariable

interface I_edby75 {
  class Impl implements I_edby75 {
    @GuardedBy("this")
    private int number = 42;
  }

  public static void t(I_edby75 other) {
    if (other instanceof Impl otherImpl) {
      synchronized (otherImpl) {
        int a = otherImpl.number;
      }
    }
  }
}

// test: parseError


class IllegalStartOfExpression_edby76 {
  @GuardedBy("itself (synchronized blocks)")
  // BUG: Diagnostic contains: could not resolve
  int field;
}

