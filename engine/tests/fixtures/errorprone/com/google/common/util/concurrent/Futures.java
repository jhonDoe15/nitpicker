package com.google.common.util.concurrent;

public final class Futures {
  public static <V> ListenableFuture<V> immediateFuture(V value) {
    return null;
  }

  public static <V, X extends Exception> V getChecked(java.util.concurrent.Future<V> future, Class<X> exceptionClass) throws X {
    return null;
  }

  public static <V, X extends Exception> V getChecked(java.util.concurrent.Future<V> future, Class<X> exceptionClass, long timeout, java.util.concurrent.TimeUnit unit) throws X {
    return null;
  }

  public static <V> V getUnchecked(java.util.concurrent.Future<V> future) {
    return null;
  }
}
