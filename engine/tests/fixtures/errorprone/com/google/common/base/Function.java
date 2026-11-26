package com.google.common.base;

public interface Function<F, T> extends java.util.function.Function<F, T> {
  @Override
  T apply(F input);
}
