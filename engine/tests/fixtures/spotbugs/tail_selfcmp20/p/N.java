package p;

public class N {
    Object g; int h; long l; String s;
    N(Object x) { g = null; g = x; }
    N(int x) { h = 0; h = x; }
    N(int x, int y) { h = 1; h = x; }
    N(String x) { s = "a"; s = x; }
    void m1(Object x) { g = null; g = x; }
    void m2(int x) { h = 0; h = x; }
    void m3(int x) { h = 1; h = x; }
    void m4(long x) { l = 0L; l = x; }
    void m5(String x) { s = null; s = x; }
    void m6(String x) { s = ""; s = x; }
    void m7(Object x) { g = x; g = null; }
    void m8(int x) { h = x; h = 0; }
}
