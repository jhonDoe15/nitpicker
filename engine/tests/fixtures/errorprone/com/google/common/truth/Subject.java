package com.google.common.truth;

public class Subject {
  public void isTrue() {}

  public void isEqualTo(Object other) {}

  public void isNotEqualTo(Object other) {}

  public StandardSubjectBuilder check(String format, Object... args) {
    return null;
  }

  public void isNotSameInstanceAs(Object other) {}

  public void isAnyOf(Object first, Object second, Object... rest) {}

  public void isNoneOf(Object first, Object second, Object... rest) {}

  public void isSameInstanceAs(Object other) {}

  protected Subject() {}

  protected Subject(FailureMetadata metadata, Object actual) {}

  protected final Object actual() {
    return null;
  }

  public interface Factory<SubjectT extends Subject, ActualT> {
    SubjectT createSubject(FailureMetadata metadata, ActualT actual);
  }

  protected final void failWithActual(String key, Object value) {}

  protected final void failWithoutActual(String message) {}

  protected final void failWithActual(String message) {}

  public void isIn(Iterable<?> iterable) {}

  public void isNotIn(Iterable<?> iterable) {}
}
