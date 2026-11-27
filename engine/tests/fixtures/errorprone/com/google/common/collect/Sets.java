package com.google.common.collect;

import java.util.HashSet;

public final class Sets {
  public static <E> HashSet<E> newHashSet(E... elements) {
    return new HashSet<E>();
  }

  public static <E> HashSet<E> newHashSet() {
    return new HashSet<E>();
  }

  public static <E> java.util.LinkedHashSet<E> newLinkedHashSet() {
    return new java.util.LinkedHashSet<E>();
  }

  public static <E> java.util.Set<E> newConcurrentHashSet() {
    return new HashSet<E>();
  }

  public static <E> java.util.Set<E> difference(java.util.Set<E> set1, java.util.Set<?> set2) {
    return set1;
  }
}
