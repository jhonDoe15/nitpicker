package rb1;
public class B1 {
    int f;
    void a(Other o) {
        if (f > 3) { return; }
        Other.poke(this);
        if (f > 3) { System.out.println("x"); }
    }
    void b() {
        if (f > 3) { return; }
        helper();
        if (f > 3) { System.out.println("y"); }
    }
    void helper() { int k = 1; k++; }
    void c() {
        if (f > 3) { return; }
        rec(3);
        if (f > 3) { System.out.println("z"); }
    }
    void rec(int n) { if (n > 0) rec(n - 1); }
    void d() {
        if (f > 3) { return; }
        if (f > 1 && foo()) { System.out.println("q"); }
        if (f > 3) { System.out.println("w"); }
    }
    boolean foo() { return true; }
    void e() {
        if (f > 3) { return; }
        Runnable r = () -> { f = 9; };
        r.run();
        if (f > 3) { System.out.println("r"); }
    }
    synchronized void g() {
        if (f > 3) { return; }
        if (f > 3) { System.out.println("s"); }
    }
    void h() {
        if (f > 3) { return; }
        synchronized (this) { }
        if (f > 3) { System.out.println("sy"); }
    }
}
