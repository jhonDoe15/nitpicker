package com.google.common.cache;

public abstract class CacheLoader<K, V> {
  public abstract V load(K key) throws Exception;
}
