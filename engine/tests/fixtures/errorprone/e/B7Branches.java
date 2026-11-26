package e;

import java.util.Comparator;
import java.util.Map;
import java.util.Optional;
import java.util.OptionalInt;
import java.util.Set;

class B7Branches {
  int x;

  static void assertTrue(boolean b) {}

  int branches(boolean flag, int a, int b) {
    if (flag) {
      a = 1;
    } else {
      a = 1;
    }
    if (flag) a = 2;
    else a = 2;
    if (flag) {
      a = 3;
    } else if (a > 1) {
      a = 3;
    } else {
      a = 4;
    }
    if (a > b) {
      // first
      b = 5; // trailing
    } else {
      /* second */
      b = 5;
    }
    if (flag) {
      return 1;
    } else {
      return 1;
    }
  }

  void nested(boolean flag, int a) {
    for (int i = 0; i < 3; i++)
      if (flag) {
        a++;
      } else {
        a++;
      }
    switch (a) {
      case 1:
        if (flag) {
          a++;
        } else {
          a++;
        }
        break;
      default:
    }
    if (flag) {
      a++;
    } else {
    }
    if (flag) {
    } else {
    }
    if (flag) a++; else { a++; }
  }

  int ternary(boolean flag, int a) {
    int b = flag ? a + 1 : a + 1;
    int c = flag ? (a) : a;
    String d = flag ? "x" : "x";
    return flag ? b : b /* same */;
  }

  @SuppressWarnings("DuplicateBranches")
  int suppressed(boolean flag) {
    return flag ? 1 : 1;
  }

  void identities(int a, long l, double d, float f, boolean p, Integer boxed, int[] array) {
    boolean b1 = a == a;
    boolean b2 = a != a;
    boolean b3 = a < a;
    boolean b4 = a >= a;
    boolean b5 = d == d;
    boolean b6 = d != d;
    boolean b7 = f != f;
    boolean b8 = boxed == boxed;
    int i1 = a / a;
    int i2 = a - a;
    int i3 = a % a;
    int i4 = a << a;
    int i5 = a >> a;
    int i6 = a >>> a;
    int i7 = a & a;
    int i8 = a | a;
    int i9 = a ^ a;
    boolean b9 = p && p;
    boolean b10 = p || p;
    boolean b11 = p & p;
    int ok1 = a * a;
    int ok2 = a + a;
    int ok3 = 1 << 1;
    int ok4 = 1 / 1;
    int ok5 = 5 - 5;
    long ok6 = 2L - 2L;
    boolean b12 = array[0] == array[0];
    boolean b13 = this.x == this.x;
    boolean b14 = x == this.x;
    boolean b15 = (a) == (a);
    boolean b16 = 1 == 1;
    boolean b17 = "a" == "a";
    assertTrue(a == a);
    assertTrue(a != a);
    assertTrue(a < a || a > a);
  }

  @SuppressWarnings("IdentityBinaryExpression")
  boolean suppressedIdentity(int a) {
    return a == a;
  }

  static final int LIMIT = 4;

  int constants(int a) {
    int c1 = LIMIT << LIMIT;
    int c2 = LIMIT - LIMIT;
    int c3 = LIMIT + LIMIT;
    int c4 = LIMIT == LIMIT ? 1 : 0;
    return c1 + c2 + c3 + c4;
  }

  static class Cmp implements Comparator<String> {
    public int compare(String a, String b) {
      return a.length() < b.length() ? -1 : 1;
    }
  }

  static class Cmp2 implements Comparator<Long> {
    public int compare(Long a, Long b) {
      return 1;
    }
  }

  static class Cmp3 implements Comparator<String> {
    public int compare(String a, String b) {
      if (a.equals(b)) {
        return 0;
      }
      return -1;
    }
  }

  static class Cmp4 implements Comparator<String> {
    public int compare(String a, String b) {
      return a.compareTo(b) > 0 ? 1 : -1;
    }
  }

  static class Cmp5 implements Comparator<String> {
    public int compare(String a, String b) {
      int x = a.length();
      int y = b.length();
      return x > y ? 1 : -1;
    }
  }

  static class Cmp6 implements Comparator<String> {
    public int compare(String a, String b) {
      long x = a.length();
      long y = b.length();
      return x > y ? 1 : -1;
    }
  }

  static class Cmp7 implements Comparator<String> {
    public int compare(String a, String b) {
      return a.isEmpty() ? 1 : 0;
    }
  }

  static class Cmp8 implements Comparator<String> {
    public int compare(String a, String b) {
      return a.length() == b.length() ? 1 : -1;
    }
  }

  static class Cmp9 implements Comparator<String> {
    static final int NEG = -2;

    public int compare(String a, String b) {
      return a.isEmpty() ? NEG : NEG;
    }
  }

  static class Comp implements Comparable<Comp> {
    public int compareTo(Comp o) {
      return 1;
    }
  }

  static class Comp2 implements Comparable<Comp2> {
    public int compareTo(Comp2 o) {
      if (o == this) {
        return 0;
      }
      return 1;
    }
  }

  Comparator<String> anonymous() {
    return new Comparator<String>() {
      @Override
      public int compare(String a, String b) {
        return -1;
      }
    };
  }

  Comparator<String> lambdaOk() {
    return (a, b) -> -1;
  }

  void distinct(int a, int b) {
    Set<Integer> s1 = Set.of(a, b, a);
    Set<Integer> s2 = Set.of(a, a, b, b, a);
    Set<Integer> s3 = Set.of(a, b);
    Map<Integer, Integer> m1 = Map.of(a, 1, a, 2);
    Map<Integer, Integer> m2 = Map.of(a, a, b, b);
    Map<Integer, Integer> m3 = Map.of(a, 1, b, 2, a, 3, a, 4);
    Set<Integer> s4 = Set.of(a, (a));
  }

  void optionals(Optional<String> opt, Optional<String> other, OptionalInt number) {
    opt.map(v -> opt.get().length());
    opt.ifPresent(v -> System.out.println(opt.get() + other.get()));
    opt.filter(v -> opt.orElse("x").isEmpty());
    opt.flatMap(v -> Optional.of(opt.orElseThrow()));
    opt.map(v -> other.get());
    opt.map(v -> v);
    opt.ifPresent(v -> opt.ifPresent(w -> System.out.println(opt.get())));
    number.ifPresent(n -> System.out.println(number.getAsInt()));
    opt.map((String v) -> opt.get());
    opt.map(v -> this.toString());
  }
}
