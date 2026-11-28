package e;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Function;

class B6Names<T> {
  String String;
  List<String> List;
  Map.Entry<String, Integer> Entry;
  java.util.Map.Entry<? extends Number, ? super Integer> Entry2;
  B6Names<?> B6Names;
  B6Names<Map<String, List<Integer>>> Other;
  String[] Array;
  String[] strings;
  int[] ints;
  int Integer;
  Integer Integer2;
  Object object;
  Object Object;
  T T;
  List<T> TList;
  java.lang.Runnable Runnable;
  @Deprecated Thread Thread;
  final java.util.Date Date = null, other = null;

  enum Mode {
    Mode, Other;
  }

  enum Color {
    RED, Color
  }

  void params(String String, List<String> list, Map<String, ?> Map, int[] Integer, StringBuilder StringBuilder) {
    for (String String2 : list) {
    }
  }

  void loops(List<String> list) {
    for (String String : list) {
    }
    for (var Integer : java.util.Arrays.asList(1)) {
    }
    try (java.io.StringReader StringReader = new java.io.StringReader("")) {
    } catch (RuntimeException RuntimeException) {
    }
    try {
    } catch (IllegalStateException | IllegalArgumentException IllegalArgumentException) {
    }
  }

  void vars() {
    var ArrayList = new ArrayList<String>();
    var HashMap = new java.util.HashMap<String, List<String>>();
    var Integer2 = 1;
    var String3 = "s";
    var Object = new Object();
  }

  void lambdas() {
    Function<String, String> f = String -> String;
    Function<List<String>, Integer> g = (List) -> 1;
    Function<List<String>, Integer> h = (List<String> List) -> 1;
    Function<String, String> k = (var String) -> String;
    Runnable Runnable = () -> {};
  }

  void patterns(Object o) {
    if (o instanceof String String) {
    }
    if (o instanceof List<?> List && List.isEmpty()) {
    }
  }

  <U> void generic(U U, List<U> List, T T) {
    U Other;
  }

  <T2 extends Number> void bounded(T2 T2, Number Number) {
  }

  @SuppressWarnings("VariableNameSameAsType")
  void suppressed(String String) {
  }

  void localNames() {
    String string = "x";
    Thread thread;
    java.lang.String java;
    B6Names<String> b6Names;
    Entry = null;
  }

  record R(String String, int x) {}
  record R2(String s) {
    R2 {
      String String = s;
    }
  }

  interface I {
    String String = "x";
    Integer Integer = 1;
  }

  class Inner {
    Inner Inner;
    B6Names<T>.Inner Inner2;
  }

  static class StaticNested {
    StaticNested StaticNested;
  }

  void anonymous() {
    new Object() {
      Object Object;
      void f(Runnable Runnable) {}
    };
  }
}
