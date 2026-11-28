package p;

import java.util.Objects;

public class B {
    int f, g; static int s; B o; float fl; double d; long l; String str; Object obj; boolean bo; char c; byte by; short sh; Integer boxed;
    int[] arr;
    boolean c1() { return s == s; }
    boolean c2() { return fl == fl; }
    boolean c3() { return d == d; }
    boolean c4() { return d < d; }
    boolean c5(double v) { return v == v; }
    boolean c6(float v) { return v != v; }
    boolean c7() { return bo == bo; }
    boolean c8() { return c == c; }
    boolean c9() { return by == by; }
    boolean c10() { return sh == sh; }
    boolean c11() { return boxed == boxed; }
    boolean c12() { return boxed.equals(boxed); }
    boolean c13() { return obj.equals(obj); }
    boolean c14(Object v) { return v.equals(v); }
    boolean c15(Object v) { return Objects.equals(v, v); }
    int c16(Integer v) { return v.compareTo(v); }
    boolean c17(B v) { return v.o == v.o; }
    boolean c18(B v, B w) { return v.f == w.f; }
    boolean c19() { return o.f == o.f; }
    boolean c20() { return arr[0] == arr[0]; }
    boolean c21(int[] a) { return a[0] == a[0]; }
    boolean c22(int v) { return v > v; }
    boolean c23(int v) { return v <= v; }
    boolean c24(int v) { return v != v; }
    boolean c25(int v) { return v < v; }
    boolean c26(long v) { return v != v; }
    boolean c27(long v) { return v < v; }
    boolean c28(String v) { return v.equalsIgnoreCase(v); }
    boolean c29(String v) { return v.contentEquals(v); }
    int c30(String v) { return v.compareToIgnoreCase(v); }
    boolean c31() { return this == this; }
    boolean c32(boolean v) { return v == v; }
    boolean c33(boolean v) { return v != v; }
    boolean c34(char v) { return v == v; }
    boolean c35() { return f == this.f; }
    boolean c36() { return s == B.s; }
    boolean c37() { int x = f; int y = f; return x == y; }
    boolean c38(int v) { int x = v; return x == v; }
    boolean c39(int v) { int x = v; int y = x; return y == v; }
    boolean c40() { return getF() == getF(); }
    int getF() { return f; }
    boolean c41(int v) { if (v == v) { return true; } return false; }
    boolean c42() { if (f == f) { return true; } return false; }
    boolean c43(int v) { return v == v ? true : false; }
    void c44(int v) { while (v == v) { v++; } }
    boolean c45(int v) { return (v + 1) == (v + 1); }
    boolean c46() { return f == g; }
    boolean c47(String v) { return v.equals(v.toString()); }
    boolean c48(Object v) { return v == (Object) v; }
}
