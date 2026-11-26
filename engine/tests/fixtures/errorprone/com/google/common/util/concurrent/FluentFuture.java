package com.google.common.util.concurrent;

public abstract class FluentFuture<V> implements ListenableFuture<V> {
  public static <V> FluentFuture<V> from(ListenableFuture<V> future) {
    return null;
  }

  public final <T> FluentFuture<T> transformAsync(AsyncFunction<? super V, T> function, java.util.concurrent.Executor executor) {
    return null;
  }

  public static <V> ListenableFuture<V> immediateFuture(V value) {
    return null;
  }
}
