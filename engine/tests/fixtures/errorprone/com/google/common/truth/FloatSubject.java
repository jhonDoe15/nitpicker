package com.google.common.truth;

public class FloatSubject extends Subject {
  public TolerantFloatComparison isWithin(float tolerance) {
    return null;
  }

  public TolerantFloatComparison isNotWithin(float tolerance) {
    return null;
  }

  public abstract static class TolerantFloatComparison {
    public abstract void of(float expected);
  }
}
