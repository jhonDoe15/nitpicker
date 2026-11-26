package com.google.common.truth.extensions.proto;

import com.google.common.truth.IterableSubject;

public class IterableOfProtosSubject extends IterableSubject {
  public ProtoFluentAssertion ignoringFields(int firstFieldNumber, int... rest) {
    return null;
  }
}
