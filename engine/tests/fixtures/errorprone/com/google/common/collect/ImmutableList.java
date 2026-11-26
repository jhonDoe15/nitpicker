package com.google.common.collect;

public abstract class ImmutableList<E> extends ImmutableCollection<E> implements java.util.List<E> {
  public static <E> ImmutableList<E> of(E element) {
    return null;
  }

  public static <E> ImmutableList<E> of() {
    return null;
  }

  public static <E> ImmutableList<E> of(E first, E second, E... rest) {
    return null;
  }

  public static <E> ImmutableList<E> copyOf(java.util.Collection<? extends E> elements) {
    return null;
  }

  public static <E> Builder<E> builder() {
    return new Builder<>();
  }

  public static <E> java.util.stream.Collector<E, ?, ImmutableList<E>> toImmutableList() {
    return null;
  }

  public static class Builder<E> {
    public Builder<E> add(E element) {
      return this;
    }

    public Builder<E> addAll(Iterable<? extends E> elements) {
      return this;
    }

    public ImmutableList<E> build() {
      return null;
    }
  }
}
