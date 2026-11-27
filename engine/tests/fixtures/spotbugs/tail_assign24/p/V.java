package p;
public class V { int f, g, count; volatile int vc;
    void d1(int hash) { g = hash; this.count = this.count; }
    void d2(int a) { g = a; this.count = this.count; }
    void d3(int abcd) { g = abcd; this.count = this.count; }
    void d4(int cou) { g = cou; this.count = this.count; }
    void d5(int ab) { g = ab; this.f = this.f; }
    void d6(int abc) { g = abc; this.f = this.f; }
    void d7(int abcdef) { g = abcdef; this.f = this.f; }
    void d8(int hash) { g = hash; int x = this.vc; this.vc = x; }
    void d9(Object key, int hash, Object value, boolean only) { g = hash; int x = this.count; this.count = x; }
    void d10(int hash) { this.count = this.count; }
    void d11(int ff) { g = ff; this.f = this.f; }
    void d12(int fff) { g = fff; this.f = this.f; }
    void d13(int counts) { g = counts; this.count = this.count; }
    Object[] read() { return new Object[] { f }; }
}
