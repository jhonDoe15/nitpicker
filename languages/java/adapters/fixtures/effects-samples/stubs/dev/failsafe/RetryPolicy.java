package dev.failsafe;

public class RetryPolicy<R> implements Policy<R> {
  public static <R> RetryPolicy<R> ofDefaults() {
    return new RetryPolicy<>();
  }
}
