package p;
public class V { int f, g; static int s;
    void a1() { int x, y; x = x = 17; f = x; }
    void a2() { int x; x = x = f; g = x; }
    int a3(int v) { int x; x = x = v; return x; }
    int a4(int v) { g = v; v = v = 3; return v; }
    void a5() { long x; x = x = 17L; f = (int) x; }
    void a6() { Object x; x = x = "a"; System.out.println(x); }
    void a7() { int x = 0; x = x = 17; f = x; }
    void a8() { int x; x = x = 17; }
    void a9() { int x; int y; x = y = 17; f = x + y; }
    void a10() { f = f = 3; }
    void a11() { int x; x = (x = 17); f = x; }
    void a12() { int x; x = x = x = 17; f = x; }
    void a13(int v) { int x = 1; x = x = v + 1; f = x; }
    void a14() { int x; x = x = 17; f = x; x = x = 18; g = x; }
    void a15() { double x; x = x = 1.5; f = (int) x; }
    void a16() { int x; x = x = 17; f = x; int z; z = z = 1; g = z; }
}
