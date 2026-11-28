package p;

import java.util.Objects;
import java.util.List;
import java.math.BigDecimal;

public class Q {
    int f; Q o; String str; static int s;
    void m() { }
    boolean c1(int v) { return Integer.compare(v, v) == 0; }
    boolean c2(Object v) { return Objects.equals(v, v); }
    int c3(int v) { return Math.max(v, v); }
    boolean c4(Q v) { return v.equals(v); }
    boolean c5(List<String> v) { return v.equals(v); }
    boolean c6(BigDecimal v) { return v.compareTo(v) == 0; }
    boolean c7(String v) { return v.startsWith(v); }
    boolean c8(String v) { return v.contains(v); }
    boolean c9(Q v) { return v.same(v); }
    boolean same(Q q) { return false; }
    public boolean equals(Object x) { return x instanceof Q && f == ((Q) x).f; }
    public int hashCode() { return f; }
    boolean c10(R v) { return v.equals(v); }
    boolean c11(Comparable<String> v, String w) { return v.compareTo(w) == 0; }
    boolean c12(String v) { String w = v; return v.equals(w); }
    boolean c13() { String x = str; m(); return x.equals(x); }
    boolean c14() { String x = str; String y = str; m(); return x.equals(y); }
    boolean c15() { int x = f; int y = f; m(); return x - y == 0; }
    boolean c16() { int x = f; int y = f; m(); return (x ^ y) == 0; }
    boolean c17() { int x = f; int y = x; m(); return x == y; }
    boolean c18(Q q) { int x = q.f; int y = q.f; m(); return x == y; }
    boolean c19() { int x = s; int y = s; m(); return x == y; }
    boolean c20() { int x = f; int y = f; f = 3; return x == y; }
    boolean c21() { int y = f; int x = f; m(); return x == y; }
    boolean c22(Q v) { return v.equals((Object) v); }
    boolean c23(String v) { return v.equals(v.trim()); }
    boolean c24(Integer v) { return v.equals(v); }
    boolean c25(int v) { Integer w = v; return w.equals(w); }
    boolean c26(String v) { return "x".equals(v) && v.equals(v); }
    boolean c27(java.util.Date v) { return v.before(v); }
    int c28(Integer v) { return v.compareTo(v); }
    boolean c29(Boolean v) { return v.equals(v); }
}
class R {
    public boolean equals(Object x) { return true; }
    public int hashCode() { return 1; }
}
