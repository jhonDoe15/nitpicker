package com.google.common.truth;

public abstract class Correspondence<A, E> {
  public interface BinaryPredicate<A, E> {
    boolean apply(A actual, E expected);
  }

  public static <A, E> Correspondence<A, E> from(BinaryPredicate<A, E> predicate, String description) {
    return null;
  }
}
