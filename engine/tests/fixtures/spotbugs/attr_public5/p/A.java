package p;
public class A {
    public int u1, u2, u3;
    public A() { Runnable r = () -> u1 = 1; r.run(); }
    void m() { new Object() { void w() { u2 = 1; } }; u2 = 2; }
    void k() { u3 = 4; }
}
