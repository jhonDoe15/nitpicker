package p;
public class W {
    Object o = new Object(); boolean ok;
    void a() throws Exception { synchronized (o) { while (ok) { o.wait(); return; } } }
    void b() throws Exception { synchronized (o) { while (ok) { o.wait(); throw new Exception(); } } }
    void c() throws Exception { synchronized (o) { for (int i = 0; i < 3; i++) { o.wait(); break; } } }
    void d() throws Exception { synchronized (o) { do { o.wait(); break; } while (ok); } }
    void e() throws Exception { synchronized (o) { while (ok) { if (ok) { o.wait(); break; } } } }
    void f() throws Exception { synchronized (o) { while (ok) { o.wait(); if (ok) break; } } }
    void g() throws Exception { synchronized (o) { for (Object x : new Object[1]) { o.wait(); break; } } }
    void h() throws Exception { synchronized (o) { while (ok) { o.wait(); return; } } }
    void i() throws Exception { synchronized (o) { x: while (ok) { while (ok) { o.wait(); break x; } } } }
    void j() throws Exception { synchronized (o) { while (ok) { while (ok) { o.wait(); break; } } } }
    void k() throws Exception { synchronized (o) { do { o.wait(); } while (false || false); } }
}
