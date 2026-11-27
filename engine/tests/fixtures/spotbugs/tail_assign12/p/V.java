package p;
public class V { int f, g; long l; V o;
    void d1(int a0, int a1) { f = f; }
    void d2(int a, int b) { f = f; }
    void d3(int a, int b2) { f = f; }
    void d4(int a, int b) { int x = f; f = x; }
    void d5(int a, int b2) { int x = f; f = x; }
    void d6(long a, long b) { l = l; }
    void d7(int f) { this.f = this.f; }
    void d8(int a, int f) { this.f = this.f; }
    void d9(int g) { this.f = this.f; }
    void d10(int g, int h) { this.f = this.f; }
    void d11(int a, int g) { this.f = this.f; }
    void d12(long a, int b) { this.f = this.f; }
    void d13(long a, int b, int c) { this.f = this.f; }
    void d14(int a, long b, int c) { this.f = this.f; }
    void d15(int a, int b, int c) { this.f = this.f; }
    static void d16(V v, int a) { v.f = v.f; }
    static void d17(V v, int a, int b) { v.f = v.f; }
    void d18() { V r = this; r.f = r.f; }
    void d19() { int x = f; V r = this; r.f = x; }
    void d20() { f = g = f; }
    void d21() { f = f++; }
    void d22(V v) { v.f = v.f; }
    void d23() { int a = 1; f = f; }
    void d24(int a) { int b = 1; f = f; }
    Object[] read() { return new Object[] { l }; }
}
