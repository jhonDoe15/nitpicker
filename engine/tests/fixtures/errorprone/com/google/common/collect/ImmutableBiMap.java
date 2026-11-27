package com.google.common.collect;

public abstract class ImmutableBiMap<K, V> extends ImmutableMap<K, V> implements BiMap<K, V> {
  public static <K, V> ImmutableBiMap<K, V> of(K k1, V v1, K k2, V v2) {
    return null;
  }

  public static <K, V> Builder<K, V> builder() {
    return new Builder<>();
  }

  public static final class Builder<K, V> extends ImmutableMap.Builder<K, V> {
    @Override
    public Builder<K, V> put(K key, V value) {
      return this;
    }

    @Override
    public ImmutableBiMap<K, V> buildOrThrow() {
      return null;
    }
  }
}
