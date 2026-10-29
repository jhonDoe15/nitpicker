package dev.failsafe;

public class CircuitBreaker<R> implements Policy<R> {
  public static <R> CircuitBreaker<R> ofDefaults() {
    return new CircuitBreaker<>();
  }
}
