package s;

import java.util.List;

@SuppressWarnings("PMD.Other")
class A {
  static final String RULE = "PMD.Q";
  int plain = 1;
  int marked = 2; // NOPMD
  int reasoned = 3; // NOPMD because it is fine
  int lower = 4; // nopmd
  int block = 5; /* NOPMD */
  /* NOPMD */ int before = 6;
  // NOPMD
  int above = 7;
  int spaced = 8; //NOPMD
  int inside = 9; // see NOPMD here
  String text = "// NOPMD";
  int
      split = 10; // NOPMD

  @SuppressWarnings("PMD")
  int whole = 11;

  @SuppressWarnings("PMD.Q")
  int named = 12;

  @SuppressWarnings("PMD.Other")
  int other = 13;

  @SuppressWarnings("all")
  int all = 14;

  @SuppressWarnings({"unchecked", "PMD.Q"})
  int listed = 15;

  @SuppressWarnings(value = "PMD.Q")
  int valued = 16;

  @SuppressWarnings(RULE)
  int constant = 17;

  @SuppressWarnings("pmd.q")
  int lowered = 18;

  @SuppressWarnings("Q")
  int bare = 19;

  @SuppressWarnings("PMD.Q, PMD.Other")
  int joined = 20;

  @java.lang.SuppressWarnings("PMD.Q")
  int qualified = 21;

  @SuppressWarnings("PMD.Q")
  int method(int parameter) {
    int local = parameter;
    Runnable r = () -> { int deep = 1; };
    return local;
  }

  int parameters(@SuppressWarnings("PMD.Q") int quiet, int loud) {
    @SuppressWarnings("PMD.Q")
    int local = quiet;
    int next = loud;
    for (@SuppressWarnings("PMD.Q") int i = 0; i < 2; i++) {
      int body = i;
    }
    try {
      next++;
    } catch (@SuppressWarnings("PMD.Q") RuntimeException error) {
      int handled = 1;
    }
    List<String> names = List.of();
    names.forEach((@SuppressWarnings("PMD.Q") String name) -> { int inner = 2; });
    return local + next;
  }

  @SuppressWarnings("PMD.Q")
  A() {
    int built = 1;
  }

  @SuppressWarnings("PMD.Q")
  static class Nested {
    int field = 1;
    class Deeper {
      int deepest = 2;
    }
  }

  @SuppressWarnings("PMD.Q")
  enum Kind {
    ONE;
    int member = 1;
  }

  enum Other {
    @SuppressWarnings("PMD.Q")
    TWO {
      int inside = 1;
    },
    THREE;
    int member = 1;
  }

  @SuppressWarnings("PMD.Q")
  record Point(int x, int y) {}

  record Pair(@SuppressWarnings("PMD.Q") int left, int right) {}

  @SuppressWarnings("PMD.Q")
  interface Shape {
    int SIDES = 4;
  }

  @SuppressWarnings("PMD.Q")
  @interface Marker {
    int value() default 1;
  }

  @SuppressWarnings("unused")
  int unused = 22;

  @SuppressWarnings("serial")
  int serial = 23;
}
