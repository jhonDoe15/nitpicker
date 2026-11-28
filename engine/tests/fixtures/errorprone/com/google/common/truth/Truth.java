package com.google.common.truth;

import java.util.Map;

public final class Truth {
  public static Subject assertThat(Object actual) {
    return null;
  }

  public static ThrowableSubject assertThat(Throwable actual) {
    return null;
  }

  public static MapSubject assertThat(Map<?, ?> actual) {
    return null;
  }

  public static FloatSubject assertThat(Float actual) {
    return null;
  }

  public static DoubleSubject assertThat(Double actual) {
    return null;
  }

  public static StandardSubjectBuilder assertWithMessage(String messageToPrepend) {
    return null;
  }

  public static StandardSubjectBuilder assertWithMessage(String messageToPrepend, Object... args) {
    return null;
  }

  public static IterableSubject assertThat(Iterable<?> actual) {
    return null;
  }

  public static StreamSubject assertThat(java.util.stream.Stream<?> actual) {
    return null;
  }

  public static <S extends Subject, A> SimpleSubjectBuilder<S, A> assertAbout(Subject.Factory<S, A> factory) {
    return null;
  }

  public static StandardSubjectBuilder assert_() {
    return null;
  }

  public static MultimapSubject assertThat(com.google.common.collect.Multimap<?, ?> actual) {
    return null;
  }

  public static MultisetSubject assertThat(com.google.common.collect.Multiset<?> actual) {
    return null;
  }
}
