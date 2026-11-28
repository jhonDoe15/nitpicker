package com.google.common.collect;

public interface Multimap<K, V> {
  int size();

  boolean isEmpty();

  Multiset<K> keys();

  java.util.Set<K> keySet();
}
