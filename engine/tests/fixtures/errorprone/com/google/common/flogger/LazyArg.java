package com.google.common.flogger;

public interface LazyArg<T> {
  T evaluate();
}
