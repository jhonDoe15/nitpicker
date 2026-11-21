package e;

import java.io.FileNotFoundException;
import java.io.IOException;
import java.util.function.LongSupplier;
import java.util.function.Supplier;

class Statements {
  int first, second;
  ;
  static {
    int ready = 1;
  }
  ;

  static class Nested {}
  ;

  record Point(int x, int[] cells) {
    ;
    Point {}
    ;
  }

  record Bare(int only) {
    ;
  }

  enum Kind {
    ONE,
    TWO;
    ;
    int rank;
    ;
  }

  enum Lone {
    SOLE;
    ;
  }

  interface Shape {
    void draw();
    ;
  }

  final class Sealed extends Base {
    protected int open;

    protected void own() {}

    @Override
    protected void inherited() {}
  }

  class Base {
    protected void inherited() {}
  }

  void semicolons(int count) {
    ;
    if (count > 1) ;
    else ;
    while (count < 0) ;
    for (; count < 0; ) ;
    switch (count) {
      case 1:
        ;
        break;
      default:
    }
    Runnable anonymous =
        new Runnable() {
          public void run() {}
          ;
        };
    return;
  }

  void plain() throws IOException, FileNotFoundException {}

  void qualified() throws java.io.FileNotFoundException, java.io.IOException, Exception {}

  <X extends IOException> void variable() throws X, IOException, Exception {}

  <X extends Exception> void loose() throws IOException, X {}

  void several(int count) {
    int left, right;
    int later;
    later = count;
    int twice;
    if (count > 0) {
      twice = 1;
    } else {
      twice = 2;
    }
    int bumped;
    bumped = 1;
    bumped++;
    final int fixed;
    fixed = later + twice + bumped;
    int chained;
    int other = chained = fixed;
    left = right = other;
  }

  Integer boxed(int plain, Integer already, char letter, String text) {
    Integer one = Integer.valueOf(plain);
    Integer two = Integer.valueOf(already);
    Integer three = Integer.valueOf(text);
    Long wide = Long.valueOf(plain);
    Character sign = Character.valueOf(letter);
    Integer narrow = Integer.valueOf(letter);
    one = Integer.valueOf(plain + 1);
    Supplier<Integer> lazy = () -> Integer.valueOf(plain);
    return Integer.valueOf(plain);
  }

  static final int LIMIT = 60;
  long total = LIMIT * 1000;

  long math(int a, int b) {
    final int base = 10;
    long constant = base * LIMIT;
    long product = a * b;
    long shifted = (a << b) / 2;
    long safe = a / b;
    long mixed = (long) a * b;
    long nested = (a + 1) % b;
    Long object = (long) a;
    product = a - b;
    product += a * b;
    LongSupplier lazy =
        () -> {
          return a * b;
        };
    Supplier<Long> other = () -> 1L;
    return a + b;
  }
}
