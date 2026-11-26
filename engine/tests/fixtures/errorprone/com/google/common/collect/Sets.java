package com.google.common.collect;

import java.util.HashSet;

public final class Sets {
  public static <E> HashSet<E> newHashSet(E... elements) {
    return new HashSet<E>();
  }
}
