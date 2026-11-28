package com.google.common.reflect;

public abstract class Invokable<T, R> {
  public final R invoke(T receiver, Object... args) throws Exception {
    return null;
  }
}
