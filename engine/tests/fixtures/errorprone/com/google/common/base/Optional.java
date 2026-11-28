package com.google.common.base;

public abstract class Optional<T> {
  public abstract T orNull();

  public abstract T or(T defaultValue);

  public abstract boolean isPresent();

  public static <T> Optional<T> of(T reference) {
    return null;
  }

  public static <T> Optional<T> fromNullable(T nullableReference) {
    return null;
  }

  public abstract <V> Optional<V> transform(Function<? super T, V> function);

  public abstract T get();
}
