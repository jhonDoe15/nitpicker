package h.quirks;
class E {
    String s; int i; Object x;
    void a(Object o, java.util.List<String> xs) { for (String a : xs) for (int i = 0; i < 3; i++) use(i); }
    void b(Object o, java.util.List<String> xs) { for (String a : xs) if (o instanceof String s) use(s); }
    void c(Object o) { do if (o instanceof String s) use(s); while (true); }
    void d(Object o) { if (true) if (o instanceof String s) use(s); }
    void e(Object o, java.util.List<String> xs) { for (String s : s.split(",")) use(s); }
    void f(Object o) { switch (o) { case String s: use(s); case Integer q: use(s); int i = 1; default: use(i); } }
    void g(Object o) { switch (o) { case String s when s.isEmpty() -> use(s); default -> use(s); } }
    void h(Object o) { try (java.io.Reader x = null) { use(x); } catch (Exception e) { use(x); } finally { use(x); } }
    void k(Object o) { synchronized (this) { if (!(o instanceof String s)) return; } use(s); }
    void l(Object o) { { if (!(o instanceof String s)) return; use(s); } use(s); }
    void m(Object o) { lbl: { if (!(o instanceof String s)) break lbl; use(s); } use(s); }
    void n(Object o) { while (!(o instanceof String s)) { lbl: while (true) { break; } } use(s); }
    void p(Object o) { while (!(o instanceof String s)) { Runnable r = () -> { while (true) break; }; } use(s); }
    void q(Object o) { if (!(o instanceof String s)) { switch (1) { default: return; } } use(s); }
    void r(Object o) { if (!(o instanceof String s)) { switch (1) { case 1: return; } } use(s); }
    void t(Object o) { if (!(o instanceof String s)) { do { return; } while (true); } use(s); }
    void u(Object o) { if (!(o instanceof String s)) { for (;;) { } } use(s); }
    void v(Object o) { if (!(o instanceof String s)) { try { } finally { return; } } use(s); }
    void w(Object o) { if (!(o instanceof String s)) { try { throw null; } catch (RuntimeException e) { } } use(s); }
    void y(Object o) { while (true) { if (!(o instanceof String s)) { try { break; } finally { return; } } use(s); } }
    void z(Object o) { boolean b = o instanceof String s ? s.isEmpty() : s == null; }
    void aa(Object o) { Object v = (o instanceof String s) && s.isEmpty(); }
    void ab(Object o) { if (o instanceof String s == true) use(s); }
    void ac(Object o) { if ((!(o instanceof String s))) return; use(s); }
    void ad(Object o) { for (int i = 0; ; ) { } }
    void ae(Object o) { x: for (;;) { if (!(o instanceof String s)) continue x; use(s); } }
    void af(Object o) { while (!(o instanceof String s)) { } use(s); int s = 1; use(s); }
    void use(Object o) { }
}
