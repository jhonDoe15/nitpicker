package com.google.inject;

public abstract class AbstractModule implements Module {
  @Override
  public final void configure(Binder binder) {
    configure();
  }

  protected void configure() {}

  protected <T> com.google.inject.binder.AnnotatedBindingBuilder<T> bind(Class<T> type) {
    return null;
  }

  protected Binder binder() {
    return null;
  }
}
