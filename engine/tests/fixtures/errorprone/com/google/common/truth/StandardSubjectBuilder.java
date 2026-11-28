package com.google.common.truth;

public class StandardSubjectBuilder {
  public StandardSubjectBuilder withMessage(String format, Object... args) {
    return this;
  }

  public Subject that(Object actual) {
    return null;
  }

  public <S extends Subject, A> SimpleSubjectBuilder<S, A> about(Subject.Factory<S, A> factory) {
    return null;
  }
}
