package com.google.common.truth;

public class MapSubject extends Subject {
  public Ordered containsExactly() {
    return null;
  }

  public Ordered containsExactly(Object k0, Object v0, Object... rest) {
    return null;
  }

  public <A, E> UsingCorrespondence<A, E> comparingValuesUsing(Correspondence<? super A, ? super E> correspondence) {
    return null;
  }

  public static final class UsingCorrespondence<A, E> {
    public Ordered containsExactly(Object k0, E v0, Object... rest) {
      return null;
    }
  }

  public void containsEntry(Object key, Object value) {}

  public void doesNotContainEntry(Object key, Object value) {}

  public void containsKey(Object key) {}

  public void doesNotContainKey(Object key) {}

  public Ordered containsAtLeast(Object k0, Object v0, Object... rest) {
    return null;
  }

  public Ordered containsExactlyEntriesIn(java.util.Map<?, ?> expectedMap) {
    return null;
  }

  public Ordered containsAtLeastEntriesIn(java.util.Map<?, ?> expectedMap) {
    return null;
  }
}
