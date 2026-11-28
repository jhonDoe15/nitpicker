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

  public static <I, O> ListenableFuture<O> transformAsync(ListenableFuture<I> input, AsyncFunction<? super I, ? extends O> function, java.util.concurrent.Executor executor) {
    return null;
  }

  public static <V> ListenableFuture<V> submitAsync(AsyncCallable<V> callable, java.util.concurrent.Executor executor) {
    return null;
  }

  public static ListenableFuture<Void> immediateVoidFuture() {
    return null;
  }

  public static FutureCombiner<Object> whenAllSucceed(ListenableFuture<?>... futures) {
    return null;
  }

  public static final class FutureCombiner<V> {
    public <C> ListenableFuture<C> callAsync(AsyncCallable<C> combiner, java.util.concurrent.Executor executor) {
      return null;
    }
  }
}
