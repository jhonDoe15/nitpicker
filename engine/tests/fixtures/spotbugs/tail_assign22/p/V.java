package p;
public class V extends B { int g;
    void a1() { f = f; }
    void a2() { super.f = super.f; }
    void a3(V v) { v.f = v.f; }
    void a4(B b) { b.f = b.f; }
    class I { void m() { g = g; } void n() { V.this.g = V.this.g; } }
    void a5() { Runnable r = new Runnable() { public void run() { g = g; } }; r.run(); }
    void a6() { Runnable r = () -> g = g; r.run(); }
    static void a7() { V v = new V(); v.g = v.g; }
}
