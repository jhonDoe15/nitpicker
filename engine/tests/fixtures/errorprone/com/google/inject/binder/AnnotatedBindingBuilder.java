package com.google.inject.binder;

public interface AnnotatedBindingBuilder<T> extends LinkedBindingBuilder<T> {
  LinkedBindingBuilder<T> annotatedWith(Class<? extends java.lang.annotation.Annotation> annotation);
}
