package p;
import java.util.*;
public class A {
    int f; String name;
    static Object make() { return new Object(); }
    static int num() { return 3; }
    void m01() { Object unused = make(); }
    void m02() { int x = num(); }
    void m03() { int x = 0; }
    void m04() { Object x = null; }
    void m05() { String x = ""; }
    void m06() { String x = "abc"; }
    void m07() { boolean b = true; }
    void m08() { int x = 5; }
    void m09() { int x = num(); x = num(); System.out.println(x); }
    void m10() { int x = num(); System.out.println(x); x = num(); }
    void m11() { int x = 0; x = num(); System.out.println(x); }
    void m12() { Object x = null; x = make(); System.out.println(x); }
    void m13(int a) { a = num(); }
    void m14(int a) { a = 3; }
    void m15() { int i = num(); i++; }
    int m16() { int i = num(); return i++; }
    void m17() { int x = num() + 1; }
    void m18() { List<String> l = new ArrayList<>(); }
    void m19() { Object o = new Object(); }
    void m20() { String s = name; }
    void m21() { int y = f; }
    void m22() { Class<?> c = String.class; }
    void m23() { int name = num(); }
    void m24() { String f = "x" + num(); }
    void m25() { try { num(); } catch (RuntimeException e) { e = null; } }
    void m26() { for (int i = 0; i < 3; i++) { int t = num(); } }
    void m27() { int x; if (f > 0) x = num(); else x = 2; }
    void m28() { int x = num(); if (f > 0) { x = num(); } System.out.println(x); }
    void m29() { long x = 0L; }
    void m30() { double d = 0.0; }
    void m31() { int x = -1; }
    void m32() { int x = 1; }
    void m33() { Object x = make(); x = null; }
    void m34() { String s = String.valueOf(num()); s = null; }
    void m35() { int[] a = new int[3]; }
    void m36() { int x = num(); x += 2; }
    void m37() { int x = num(); x = x + 2; }
    void m38() { Runnable r = () -> {}; }
    void m39() { Object x = this; }
    void m40() { char c = 'a'; }
}
