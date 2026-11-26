package com.google.common.truth;

public class IterableSubject extends Subject {
  public Ordered containsExactly(Object... varargs) {
    return null;
  }

  public Ordered containsExactlyElementsIn(Iterable<?> expected) {
    return null;
  }

  public Ordered containsAnyOf(Object first, Object second, Object... rest) {
    return null;
  }

  public Ordered containsAtLeast(Object first, Object second, Object... rest) {
    return null;
  }

  public void containsNoneOf(Object first, Object second, Object... rest) {}

  public <A, E> UsingCorrespondence<A, E> comparingElementsUsing(Correspondence<? super A, ? super E> correspondence) {
    return null;
  }

  public static final class UsingCorrespondence<A, E> {
    public Ordered containsExactly(E... expected) {
      return null;
    }

    public Ordered containsAtLeast(E first, E second, E... rest) {
      return null;
    }

    public void containsAnyOf(E first, E second, E... rest) {}

    public void containsNoneOf(E first, E second, E... rest) {}
  }

  public Ordered containsAtLeastElementsIn(Iterable<?> expected) {
    return null;
  }
}
