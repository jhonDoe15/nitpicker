package com.google.common.flogger;

public final class LazyArgs {
  public static <T> LazyArg<T> lazy(LazyArg<T> lambdaOrMethodReference) {
    return lambdaOrMethodReference;
  }
}
