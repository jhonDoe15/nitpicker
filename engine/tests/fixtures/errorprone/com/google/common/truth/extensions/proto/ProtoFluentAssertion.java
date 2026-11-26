package com.google.common.truth.extensions.proto;

public interface ProtoFluentAssertion {
  ProtoFluentAssertion ignoringFields(int firstFieldNumber, int... rest);

  ProtoFluentAssertion ignoringFieldAbsence();

  void isEqualTo(Object expected);

  ProtoFluentAssertion same = null;
}
