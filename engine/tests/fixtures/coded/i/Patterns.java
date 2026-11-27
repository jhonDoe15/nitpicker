package i.patterns;
class A {
    String s;
    void a(Object o) { if (!(o instanceof String s)) { s = "a"; } }
    void b(Object o) { while (!(o instanceof String s)) { s = "a"; } }
    void c(Object o) { for (; !(o instanceof String s); ) { s = "a"; } }
    void d(Object o) { if (o instanceof String s) {} else { s = "a"; } }
    void e(Object o) { if (o instanceof String s || true) { s = "b"; } }
    void f(Object o) { boolean b = o instanceof String s && s.isEmpty(); s = "1"; }
    void g(Object o) { if (!(o instanceof String s)) throw new RuntimeException(); else { } s = "2"; }
    void h(Object o) { do { s = "x"; } while (!(o instanceof String s)); s = "2"; }
    void i(Object o) { if (!(o instanceof String s)) return; s = "3"; }
    void j(Object o) { if (o instanceof String s) { s = "4"; } s = "5"; }
    void k(Object o) { String t = o instanceof String s ? s : s; }
    void l(Object o) { String t = !(o instanceof String s) ? s : s; }
    void m(Object o) { if (o instanceof String s && s.length() > 1 || s == null) { s = "6"; } }
    void n(Object o) { while (!(o instanceof String s)) { if (o == null) break; } s = "7"; }
    void q(Object o) { while (!(o instanceof String s)) { } s = "8"; }
    void r(Object o) { foo(o instanceof String s); s = "9"; }
    void t(Object o) { lbl: if (!(o instanceof String s)) return; s = "10"; }
    void u(Object o) { if (!(o instanceof String s)) { return; } else { s = "11"; } s = "12"; }
    void v(Object o) { if (o instanceof String s) { s = "13"; } else { return; } s = "14"; }
    void w(Object o) { if (!(o instanceof String s)) { throw new RuntimeException(); } { s = "15"; } }
    void x(Object o) { switch (1) { case 1: if (!(o instanceof String s)) break; s = "16"; } }
    void y(Object o) { for (int z = 0; !(o instanceof String s); z++) { } s = "17"; }
    void z(Object o) { if (!(o instanceof String s)) { while (true) {} } s = "18"; }
    void aa(Object o) { if (!(o instanceof String s)) { try { return; } finally { } } s = "19"; }
    void ab(Object o) { if (!(o instanceof String s)) { synchronized (this) { return; } } s = "20"; }
    void ac(Object o) { if (o instanceof java.util.List<?> l2 && l2 instanceof java.util.ArrayList<?> s) { s = null; } }
    void ad(Object o) { boolean b = !(o instanceof String s) || s.isEmpty(); }
    void ae(Object o) { Runnable r = () -> { if (!(o instanceof String s)) return; s = "21"; }; s = "22"; }
    void foo(boolean b) { }
}
