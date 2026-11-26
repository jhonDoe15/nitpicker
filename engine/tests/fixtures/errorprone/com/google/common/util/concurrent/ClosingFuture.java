package com.google.common.util.concurrent;

public final class ClosingFuture<V> {
  public static <V> ClosingFuture<V> immediateFuture(V value) {
    return null;
  }

  public <U> ClosingFuture<U> transformAsync(AsyncClosingFunction<? super V, U> function, java.util.concurrent.Executor executor) {
    return null;
  }

  public interface AsyncClosingFunction<T, U> {
    ClosingFuture<U> apply(T input) throws Exception;
  }
}
