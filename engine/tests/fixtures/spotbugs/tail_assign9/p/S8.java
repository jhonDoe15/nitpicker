package p;
public class S8 {
    int f, g; static int st;
    void m() { }
    void a1() { int x = f; f = x; }
    void k() { int x = f; f = 2; f = x; }
    void a2() { int x = f; f = x; }
    void a3() { f = f; }
}
