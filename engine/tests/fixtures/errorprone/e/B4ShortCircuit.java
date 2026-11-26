package e;

public class B4ShortCircuit {
  boolean m(boolean a, boolean b, boolean c, Boolean d, int x, int y) {
    boolean r1 = a & b;
    boolean r2 = a | b;
    boolean r3 = a & b & c;
    boolean r4 = a | b & c;
    boolean r5 = a & (b | c);
    boolean r6 = (a | b) & c;
    boolean r7 = a && b | c;
    boolean r8 = d & a;
    boolean r9 = d | d;
    int i1 = x & y;
    int i2 = x | y;
    boolean r10 = (x & 1) == 0 | (y | 2) == 0;
    boolean r11 = a & f(x & 1, b | c);
    boolean r12 = !(a & b);
    boolean r13 = a
        & b;
    a &= b;
    a |= b;
    return a ^ b;
  }

  boolean f(int x, boolean b) {
    return b;
  }

  @SuppressWarnings("ShortCircuitBoolean")
  boolean s(boolean a, boolean b) {
    return a & b;
  }
}
