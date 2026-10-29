package dev.failsafe;

public final class Failsafe {
  private Failsafe() {}

  @SafeVarargs
  public static <R, P extends Policy<R>> FailsafeExecutor<R> with(P... policies) {
    return new FailsafeExecutor<>();
  }
}
