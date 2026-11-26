package com.google.common.base;

public final class Ascii {
  public static String toUpperCase(String string) {
    return string;
  }

  public static String toUpperCase(CharSequence chars) {
    return chars.toString();
  }

  public static boolean isUpperCase(char c) {
    return c >= 'A' && c <= 'Z';
  }
}
