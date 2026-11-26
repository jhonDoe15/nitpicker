package com.google.common.collect;

public abstract class ImmutableMap<K, V> implements java.util.Map<K, V> {
  public static <K, V> ImmutableMap<K, V> of(K key, V value) {
    return null;
  }

  public static <K, V> Builder<K, V> builder() {
    return new Builder<>();
  }

  public static class Builder<K, V> {
    public Builder<K, V> put(K key, V value) {
      return this;
    }

    public ImmutableMap<K, V> build() {
      return null;
    }
  }

  public static <K, V> ImmutableMap<K, V> copyOf(java.util.Map<? extends K, ? extends V> map) {
    return null;
  }
}
