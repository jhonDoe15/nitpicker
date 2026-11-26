package com.google.inject;

public abstract class AbstractModule implements Module {
  @Override
  public final void configure(Binder binder) {
    configure();
  }

  protected void configure() {}
}
