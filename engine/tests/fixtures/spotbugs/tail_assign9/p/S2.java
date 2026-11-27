package p;
public class S2 {
    int f, g; static int st;
    void m() { }
    void a1() { int x = f; f = x; }
    void k(boolean c) { int x = f; if (c) m(); f = x; }
    void a2() { int x = f; f = x; }
    void a3() { f = f; }
}
