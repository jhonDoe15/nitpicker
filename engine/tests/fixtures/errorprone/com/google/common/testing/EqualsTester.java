package com.google.common.testing;

public final class EqualsTester {
  public EqualsTester addEqualityGroup(Object... group) {
    return this;
  }

  public EqualsTester testEquals() {
    return this;
  }
}
