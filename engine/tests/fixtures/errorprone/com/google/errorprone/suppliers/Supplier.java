package com.google.errorprone.suppliers;

import com.google.errorprone.VisitorState;

public interface Supplier<T> {
  T get(VisitorState state);
}
