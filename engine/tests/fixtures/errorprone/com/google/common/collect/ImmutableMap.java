package com.google.common.collect;

public abstract class ImmutableMap<K, V> implements java.util.Map<K, V> {
  public static <K, V> ImmutableMap<K, V> of(K key, V value) {
    return null;
  }

  public static <K, V> ImmutableMap<K, V> of(K k1, V v1, K k2, V v2) {
    return null;
  }

  public static <K, V> ImmutableMap<K, V> of(K k1, V v1, K k2, V v2, K k3, V v3) {
    return null;
  }

  public static <K, V> Builder<K, V> builder() {
    return new Builder<>();
  }

  public static class Builder<K, V> {
    public Builder<K, V> put(K key, V value) {
      return this;
    }

    public Builder<K, V> put(java.util.Map.Entry<? extends K, ? extends V> entry) {
      return this;
    }

    public ImmutableMap<K, V> buildOrThrow() {
      return null;
    }

    public ImmutableMap<K, V> build() {
      return null;
    }
  }

  public static <K, V> ImmutableMap<K, V> copyOf(java.util.Map<? extends K, ? extends V> map) {
    return null;
  }
}
