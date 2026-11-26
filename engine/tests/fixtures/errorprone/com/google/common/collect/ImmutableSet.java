package com.google.common.collect;

public abstract class ImmutableSet<E> extends ImmutableCollection<E> implements java.util.Set<E> {
  public static <E> ImmutableSet<E> of(E element) {
    return null;
  }

  public static <E> ImmutableSet<E> copyOf(java.util.Collection<? extends E> elements) {
    return null;
  }

  public static <E> Builder<E> builder() {
    return new Builder<>();
  }

  public static class Builder<E> {
    public Builder<E> add(E element) {
      return this;
    }

    public ImmutableSet<E> build() {
      return null;
    }
  }
}
