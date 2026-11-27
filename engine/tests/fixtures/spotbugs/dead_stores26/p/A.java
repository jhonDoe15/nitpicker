package p;
import java.util.*;
import java.util.function.*;
public class A {
    int f; Integer bf; String s;
    static void foo(Object o) {}
    static void fi(int i) {}
    static void fl(long i) {}
    static int ir() { return 1; }
    void m1() { Object a; foo(a = "x"); }
    void m2() { StringBuilder r; (r = new StringBuilder()).append(1); }
    void m3() { Object a, b; a = b = ir(); }
    void m4() { int a; fi(a = 5); }
    void m5() { int a = 0; fi(a += 5); }
    void m6() { Integer a; foo(a = 5); }
    void m7() { int a, b; a = b = ir(); }
    void m8() { int a = 1; fi(a++); }
    void m9() { int a = 1; fi(++a); }
    void m10() { long a; fl(a = ir()); }
    void m11() { int[] a; foo(a = new int[3]); }
    void m12() { var a = new ArrayList<String>(); foo(a = null); }
    void m13(Object p) { foo(p = "q"); }
    void m14(int p) { fi(p = 3); }
    void m15(int p) { fi(p = p); }
    void m16(Object p) { p = p; }
    void m17() { int x = ir(); x = x; }
    void m18() { int f = ir(); f = f; }
    void m19(int f) { f = f; }
    void m20() { Object x = new Object(); x = x; x = null; }
    void m21() { int a, b, c; a = b = c = ir(); }
    void m22() { Object a; long b; Object c; c = a = "s"; }
    void m23(boolean q) { int a; if ((a = ir()) > 0) { } }
    void m24(boolean q) { Object a; if ((a = ir() > 0 ? "a" : "b") != null) { } }
    void m25() { Object a; while ((a = null) != null) { } }
    void m26() { String a; foo(a = s); }
    void m27() { int a; fi(a = f); }
    void m28() { Object a; for (int i = 0; i < 2; foo(a = "k"), i++) { } }
    void m29() { Runnable r = () -> { Object a; foo(a = "x"); }; }
    void m30() { int a; Supplier<Integer> sp = () -> (a2()); }
    int a2() { int a; return a = 3; }
    Object a3() { Object a; return a = "x"; }
    void m31(int k) { int r = switch (k) { case 1 -> { int a; yield a = 4; } default -> 0; }; }
    void m32() { try { int a; foo(a = ir()); } finally { int b; fi(b = 2); } }
}
