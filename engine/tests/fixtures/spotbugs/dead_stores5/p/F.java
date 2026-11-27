package p;
import java.util.*;
import java.io.*;
public class F {
    int f; int name; String g;
    static Object make() { return new Object(); }
    static int num() { return 3; }
    void use(Object o) {}
    void m01() { int[] a = new int[] {}; }
    void m02() { int[] a = new int[] {1}; }
    void m03() { int[][] a = new int[2][3]; }
    void m04() { Runnable r = new Runnable() { public void run() {} }; }
    void m05() { List<String> l = new ArrayList<>(List.of("a")); }
    void m06(int a) { a = f; }
    void m07(int a, int b) { a = b; }
    void m08(Object a, Object b) { a = b; }
    void m09(int a) { a++; }
    void m10(int a) { use(a); a++; }
    void m11(int a) { a = num(); a = num(); use(a); }
    void m12() { int x = num(); x++; x++; }
    void m13() { int x = num(); x++; use(x); x++; }
    void m14() { int x = num(); x += 1; use(x); x += 1; }
    void m15() { int x = num(); x = num(); use(x); x++; }
    void m16() { int x = num(); use(x); x = num(); use(x); x++; }
    void m17() { int x = num(); use(x); x = num(); use(x); x = num(); }
    void m18() { int name = f; }
    void m19() { String g = String.valueOf(f); use(g); g = String.valueOf(f); }
    void m20() { int name = num(); use(name); name = num(); }
    void m21() { int name; name = num(); name = num(); }
    void m22() { Class<?> c = String.class; use(c); c = Integer.class; }
    void m23() { Class<?> c = num() > 0 ? String.class : Integer.class; }
    void m24() { try { use(1); } catch (RuntimeException e) { } }
    void m25() { try { use(1); } catch (RuntimeException e) { RuntimeException e2 = e; } }
    void m26() { for (String s : List.of("a")) { } }
    void m27(Object o) { if (o instanceof String s) { use(1); } }
    void m28() throws IOException { try (InputStream in = new FileInputStream("x")) { } }
    void m29() { int x = num(); try { use(x); } finally { x = num(); } }
    void m30() { switch (f) { case 1: int x = num(); break; default: use(1); } }
    void m31() { Runnable r = () -> { int x = num(); }; r.run(); }
    void m32() { Object o = new Object() { void z() { int q = num(); } }; use(o); }
    void m33() { int x = num(); while (f > 0) { x = num(); } }
    void m34() { int x = num(); while (f > 0) { use(x); x = num(); } }
    void m35() { var x = make(); }
    void m36() { Object x = make(); if (x == null) return; }
    void m37() { int x = num(); x = x * 2; }
    void m38() { int x = num(); if (f > 0) use(x); }
    void m39() { int x = num(); if (f > 0) { use(x); } else { x = num(); } }
    void m40() { int x = num(); use(x); if (f > 0) { x = num(); } }
}
