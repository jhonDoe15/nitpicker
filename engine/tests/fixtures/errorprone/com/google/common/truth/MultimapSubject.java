package com.google.common.truth;

public class MultimapSubject extends Subject {
  public void containsEntry(Object key, Object value) {}

  public void doesNotContainEntry(Object key, Object value) {}

  public void containsKey(Object key) {}

  public void doesNotContainKey(Object key) {}

  public Ordered containsExactly() {
    return null;
  }

  public Ordered containsExactly(Object k0, Object v0, Object... rest) {
    return null;
  }

  public Ordered containsAtLeast(Object k0, Object v0, Object... rest) {
    return null;
  }

  public Ordered containsExactlyEntriesIn(com.google.common.collect.Multimap<?, ?> expectedMultimap) {
    return null;
  }

  public Ordered containsAtLeastEntriesIn(com.google.common.collect.Multimap<?, ?> expectedMultimap) {
    return null;
  }
}
