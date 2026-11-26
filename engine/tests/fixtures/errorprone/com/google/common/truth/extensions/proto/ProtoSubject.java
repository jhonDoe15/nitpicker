package com.google.common.truth.extensions.proto;

import com.google.common.truth.Subject;

public class ProtoSubject extends Subject implements ProtoFluentAssertion {
  public ProtoFluentAssertion ignoringFields(int firstFieldNumber, int... rest) {
    return this;
  }

  public ProtoFluentAssertion ignoringFieldAbsence() {
    return this;
  }
}
