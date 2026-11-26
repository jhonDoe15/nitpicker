package com.google.inject;

public interface Binder {
  <T> com.google.inject.binder.AnnotatedBindingBuilder<T> bind(Class<T> type);
}
