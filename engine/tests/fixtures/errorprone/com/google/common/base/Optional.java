package com.google.common.base;

public abstract class Optional<T> {
  public abstract T orNull();

  public abstract T or(T defaultValue);
}
