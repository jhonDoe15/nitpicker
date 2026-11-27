package p;
import java.util.*;
public class B {
    static boolean a() { return true; }
    static boolean b(Object o) { return o != null; }
    void m1(int k, Object x) { switch (k) { case 1 -> { if (a() & b(x)) {} } default -> {} } }
    void m2(int k, Object x) { boolean r = switch (k) { case 1 -> a() & b(x); default -> false; }; if (r) {} }
    void m3(int k, Object x) { if (switch (k) { case 1 -> a() & b(x); default -> false; }) {} }
    void m4(int k, Object x) { if (a() & switch (k) { case 1 -> true; default -> false; }) {} }
    void m5(Object x) { try (var r = new java.io.StringReader("")) { if (a() & b(x)) {} } catch (Exception e) { if (a() & b(x)) {} } finally { if (a() & b(x)) {} } }
    void m6(Object x) { outer: for (;;) { if (a() & b(x)) break outer; } }
    void m7(Object x) { for (var s : List.of(1)) { if (x != null & s.hashCode() > 1) {} } }
    void m8(Object x, int[] arr) { for (int s : arr) { if (x != null & s > 1) {} } }
    void m9(Object x) { synchronized (x) { if (a() & b(x)) {} } if (a() & b(x)) {} }
    void m10(Object x) { String s = "a" + x; if (s != null & x.hashCode() > 1) {} }
    void m11(Object x, Integer i) { if (i != null & i > 1) {} }
    void m12(Object x, Integer i) { if (i > 1 & x != null) {} }
    void m13(Integer i, Integer j) { if (i == 1 & j == 2) {} }
    void m14(Object x) { if (x == null | x.hashCode() > 1) {} }
    void m15(Object x) { int i = x == null ? 1 : 2; if (a() & b(x)) {} }
    void m17(Object x) { boolean q = x == null ? a() : b(x); if (x != null & x.hashCode()>1) {} }
    void m18(String s) { if (s != null & s.length() > 1) {} }
    void m19(String s) { if (s != null & s.isEmpty()) {} }
    void m20(String s, List<String> l) { if (l.size() > 1 & l.get(0).isEmpty()) {} }
    void m21(Object x) { if (a() & x instanceof String) {} }
    void m22(Object x) { if (a() & !b(x)) {} }
    void m23(Object x, boolean z) { if (a() & z) {} }
    void m24(Object x, boolean z) { if (a() & (z & b(x))) {} }
    void m25(Object x, boolean z) { if (z & b(x) & a()) {} }
    void m26(Object x, boolean z) { if (a() | b(x) | z) {} }
    void m27(Object x) { if ((a() & b(x)) == true) {} }
    boolean m28(Object x) { return a() & b(x) || a(); }
    void m29(Object x) { if (a() ? a() & b(x) : false) {} }
    void m30(Object x) { while (true) { if (a() & b(x)) continue; if (a() & b(x)) break; } }
    void m31(Object x) { if (x != null) { } else { } if (a() & b(x)) {} }
    void m32(Object x) { if (x != null) { return; } else { } if (a() & b(x)) {} }
    void m33(Object x) { do { if (a() & b(x)) {} } while (a()); }
    record R(Object x) { R { if (a() & b(x)) {} } boolean z() { return a() & b(x); } }
    enum E { X { void f(Object o) { if (a() & b(o)) {} } }; void g(Object o) { if (a() & b(o)) {} } }
    interface I { default boolean d(Object o) { return a() & b(o); } }
}
