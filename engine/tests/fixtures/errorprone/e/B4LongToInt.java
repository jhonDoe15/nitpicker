package e;

import com.google.common.primitives.Ints;

public class B4LongToInt {
  void takesLong(long x) {}

  void takesLongs(int a, long b, long c) {}

  void takesInt(int x) {}

  void takesBoxed(Long x) {}

  void takesObject(Object x) {}

  void varargs(long... xs) {}

  void m(long l, Long boxed, int i, double d) {
    takesLong((int) l);
    takesLong(Ints.checkedCast(l));
    takesLong(Ints.saturatedCast(boxed));
    takesLong(Math.toIntExact(l));
    takesLong(boxed.intValue());
    takesLong((int) d);
    takesLong(i);
    takesInt((int) l);
    takesBoxed((long) (int) l);
    takesObject((int) l);
    takesLongs((int) l, (int) l, 2);
    takesLongs(1, 2, (int) l);
    takesLong(((int) l));
    takesLong((int) (l + 1));
    varargs((int) l, (int) l);
    new B4LongToInt().takesLong(Ints.checkedCast(l));
    takesLong(Ints.checkedCast(i));
  }

  @SuppressWarnings("UnnecessaryLongToIntConversion")
  void s(long l) {
    takesLong((int) l);
  }
}
