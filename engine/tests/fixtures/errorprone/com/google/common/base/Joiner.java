package com.google.common.base;

public class Joiner {
  public static Joiner on(String separator) {
    return new Joiner();
  }

  public String join(Iterable<?> parts) {
    return "";
  }

  public String join(java.util.Iterator<?> parts) {
    return "";
  }

  public String join(Object[] parts) {
    return "";
  }

  public String join(Object first, Object second, Object... rest) {
    return "";
  }
}
