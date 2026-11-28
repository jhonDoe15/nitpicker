package com.google.errorprone.util;

import com.sun.tools.javac.code.Symbol;

public final class ASTHelpers {
  public static boolean isStatic(Symbol symbol) {
    return symbol.isStatic();
  }

  static Object nested(Symbol symbol) {
    class Local {
      Object get() {
        return symbol.packge();
      }
    }
    return new Object() {
      Object get() {
        return symbol.getEnclosedElements();
      }
    }.toString() + new Local().get();
  }
}
