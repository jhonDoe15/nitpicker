package com.google.common.testing;

public final class NullPointerTester {
  public <T> NullPointerTester setDefault(Class<T> type, T value) {
    return this;
  }

  public NullPointerTester testAllPublicInstanceMethods(Object instance) {
    return this;
  }
}
