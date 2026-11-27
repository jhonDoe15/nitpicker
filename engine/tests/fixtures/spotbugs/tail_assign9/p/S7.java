package p;
public class S7 {
    int f, g; static int st;
    void m() { }
    void a1() { int x = f; f = x; }
    void k(boolean c) { int x = 1; if (c) x = 2; g = x; }
    void a2() { int x = f; f = x; }
    void a3() { f = f; }
}
