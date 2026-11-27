package p;
public class V { int f, g; String s;
    enum E { A(1); int f; String s; E(int v) { this.f = this.f; } E(String w, int u) { this.s = this.s; } }
    class I { int f; I(int v) { this.f = this.f; } I(String w, long u) { this.f = this.f; g = 1; }
        int r() { return f; } }
    static class S { int f; S(int v) { this.f = this.f; } int r() { return f; } }
    void a1(int a) { Runnable r = () -> { this.f = this.f; }; r.run(); }
    void a2(int a) { java.util.function.IntConsumer r = (int b) -> { this.f = this.f; }; r.accept(1); }
    void a3(int a) { java.util.function.IntConsumer r = (int b) -> { this.f = this.f; g = a; }; r.accept(1); }
    void a4(int a) { a++; this.f = this.f; }
    void a5(int a, int b) { b += 2; this.f = this.f; }
    void a6(int a) { Object o = new Object() { int f; void m() { this.f = this.f; g = a; } int r() { return f; } }; }
    int read() { return f; }
}
