package p;
public class U {
    void c1(long x) { long a; foo((a = x)); }
    void c2(double x) { double a; foo((a = x)); }
    void c3(boolean x) { boolean a; foo((a = x)); }
    void c4(Object o) { Object a; Object b; a = b = o; foo(b); }
    void c5(Object o) { Object a; Object b; a = b = o; foo(a); }
    void c6(Object[] o) { Object[] a; foo(a = o); }
    void c7(String o) { String a; foo(a = o + "x"); }
    void c8(Object o) { Object a; if ((a = o) == null) return; }
    void c9(int x) { int a; int b; int c; a = b = c = x; foo(a); }
    void c10(Object o) { Object a; Object b; Object c; a = b = c = o; foo(a); }
    Object c11(Object o) { Object a; return a = o; }
    int c12(int o) { int a; return a = o; }
    void c13(Object o) { Object a; synchronized (a = o) { foo(1); } }
    void c14(Object o) { Object a = null; Object b = (a = o); foo(b); }
    void foo(Object x) {}
    void foo(long x) {}
    void foo(double x) {}
    void foo(boolean x) {}
    void foo(int x) {}
}
