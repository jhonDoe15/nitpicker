package p;
public class S9 {
    int f, g; static int st;
    void m() { }
    void a1() { int x = f; f = x; }
    void k(boolean c) { int x = 0; if (c) x = f; f = x; }
    void a2() { int x = f; f = x; }
    void a3() { f = f; }
}
