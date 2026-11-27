package com.google.common.truth;

public class DoubleSubject extends Subject {
  public TolerantDoubleComparison isWithin(double tolerance) {
    return null;
  }

  public TolerantDoubleComparison isNotWithin(double tolerance) {
    return null;
  }

  public abstract static class TolerantDoubleComparison {
    public abstract void of(double expected);
  }
}
