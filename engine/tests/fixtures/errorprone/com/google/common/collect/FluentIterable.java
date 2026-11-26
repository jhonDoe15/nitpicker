package com.google.common.collect;

public abstract class FluentIterable<E> implements Iterable<E> {
  public final int size() {
    return 0;
  }

  public final boolean isEmpty() {
    return true;
  }
}
